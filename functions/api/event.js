/*
  /api/event — click-tracking sink + auth-gated stats escape hatch.

  Public routes:
    POST /api/event    (same-origin; ships from trackEvent() in script.js)
                       body: { name: string, props?: object, ts?: number }
                       variant?: string (set by Tier 4 client shim)
                       → 204 on success, 400 on bad body

  Protected routes:
    GET  /api/event    requires ?token=… matching EVENTS_TOKEN env var
                       returns the last 50 events (debug). Without a
                       correct token returns 401.

    GET  /api/stats    requires ?token=… matching EVENTS_TOKEN
                       returns click counts for the last 7 days grouped
                       by event_name + variant. Used by the Tier 3 cron
                       when it drafts a proposal.

  Persistence: D1 binding EVENTS_DB, database hanniel_events, table events.
  Schema: id INTEGER PK, ts INTEGER, event_name TEXT, props_json TEXT,
          host TEXT, variant TEXT (nullable; '' for legacy rows).

  Auth: same-origin POST (CF attaches right CORS since request comes
  from served page). Read paths require a shared secret to keep the
  row data private.
*/

function bad(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function authorised(request, env) {
  const want = (env && env.EVENTS_TOKEN) || '';
  if (!want) return false;  // no token configured → deny reads
  const url = new URL(request.url);
  const got = url.searchParams.get('token') || '';
  return constantTimeEqual(got, want);
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i += 1) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return bad('invalid json body');
  }

  const event_name = String(body.name || '').slice(0, 100);
  if (!event_name) return bad('missing event name');

  const ts = Number(body.ts) || Date.now();
  const props_json = JSON.stringify(body.props || {}).slice(0, 2000);
  const host = context.request.headers.get('host') || '';
  const variant = String(body.variant || '').slice(0, 40);

  try {
    await context.env.EVENTS_DB
      .prepare('INSERT INTO events (ts, event_name, props_json, host, variant) VALUES (?, ?, ?, ?, ?)')
      .bind(ts, event_name, props_json, host, variant)
      .run();
    return new Response(null, { status: 204 });
  } catch (e) {
    return bad(String(e), 500);
  }
}

async function d1All(env, sql, binds = []) {
  const r = await env.EVENTS_DB.prepare(sql).bind(...binds).all();
  return r.results || [];
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const path = url.pathname;

  if (!authorised(context.request, context.env)) {
    return bad('unauthorised', 401);
  }

  if (path === '/api/stats') {
    const sinceMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const byNameRows = await d1All(
      context.env,
      `SELECT event_name, variant, COUNT(*) AS n
       FROM events
       WHERE ts >= ? AND event_name LIKE 'wa-click-%'
       GROUP BY event_name, variant
       ORDER BY n DESC`,
      [sinceMs],
    );
    const totalRows = await d1All(
      context.env,
      `SELECT COUNT(*) AS n FROM events WHERE ts >= ?`,
      [sinceMs],
    );
    const byDay = await d1All(
      context.env,
      `SELECT (ts / 86400000) * 86400000 AS day, COUNT(*) AS n
       FROM events
       WHERE ts >= ?
       GROUP BY day
       ORDER BY day ASC`,
      [sinceMs],
    );
    return new Response(JSON.stringify({
      window: '7d',
      since: sinceMs,
      totals: { count: (totalRows[0] && totalRows[0].n) || 0 },
      by_name_variant: byNameRows,
      by_day: byDay,
    }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  // default: /api/event
  const rows = await d1All(
    context.env,
    `SELECT id, ts, event_name, props_json, host, variant
     FROM events ORDER BY id DESC LIMIT 50`,
  );
  return new Response(JSON.stringify({ count: rows.length, rows }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}