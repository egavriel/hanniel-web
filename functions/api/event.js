/*
  /api/event — CT (click-tracking) sink for the static site.

  Receives POSTs from the `trackEvent()` shim in script.js (which fires
  navigator.sendBeacon('/api/event', json) on every WhatsApp CTA click +
  any future event). Persists to D1 (`EVENTS_DB` binding, hanniel_events db,
  table events).

  Free: D1 free tier (5GB storage, 5M reads/day, 100k writes/day). More than
  enough for a small-biz landing page generating <100 events/day.

  Routes:
    POST /api/event   — body: { name: string, props?: object, ts?: number }
                          → 204 on success, 400 on bad body
    GET  /api/event   — returns last 50 events (for manual debugging)
                          → 200 with json

  Auth: same-origin only (CF attaches the right CORS headers automatically
  since the request comes from the served page). No bearer token — keep it
  dead simple; the data is non-sensitive click telemetry.

  Schema migration: events table has cols (id INTEGER, ts INTEGER,
  event_name TEXT, props_json TEXT, host TEXT) and indexes on
  (event_name, ts) + (host, ts).
*/

function badRequest(message) {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  });
}

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return badRequest('invalid json body');
  }

  const event_name = String(body.name || '').slice(0, 100);
  if (!event_name) return badRequest('missing event name');

  const ts = Number(body.ts) || Date.now();
  const props_json = JSON.stringify(body.props || {}).slice(0, 2000);
  const host = context.request.headers.get('host') || '';

  try {
    await context.env.EVENTS_DB
      .prepare('INSERT INTO events (ts, event_name, props_json, host) VALUES (?, ?, ?, ?)')
      .bind(ts, event_name, props_json, host)
      .run();
    return new Response(null, { status: 204 });
  } catch (e) {
    // never crash the function — telemetry must not break the page
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}

export async function onRequestGet(context) {
  try {
    const rows = await context.env.EVENTS_DB
      .prepare('SELECT id, ts, event_name, props_json, host FROM events ORDER BY id DESC LIMIT 50')
      .all();
    return new Response(JSON.stringify({ count: rows.results.length, rows: rows.results }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
