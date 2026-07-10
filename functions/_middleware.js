/*
  CF Pages Function — branch-routing middleware.

  Routes `staging.little.hanniel.co` requests to the staging branch's
  preview deployment (`staging.hanniel-web.pages.dev`), so the
  custom-domain URL always serves staging-branch content.

  Production (`little.hanniel.co`) is untouched: it falls through to
  the project's primary (main) deployment.

  Lives at functions/_middleware.js — picked up automatically by CF Pages.
  This file adds a small per-request overhead (~5ms) on staging traffic
  only; production traffic bypasses because Host != staging.little.hanniel.co.
*/

export const onRequest = async (context) => {
  const url = new URL(context.request.url);
  const host = url.hostname.toLowerCase();
  const STAGING_HOST = 'staging.little.hanniel.co';
  const STAGING_TARGET = 'staging.hanniel-web.pages.dev';

  if (host === STAGING_HOST) {
    // Proxy the request to the staging branch's preview deployment.
    const target = new URL(context.request.url);
    target.hostname = STAGING_TARGET;
    target.protocol = 'https:';

    const init = {
      method: context.request.method,
      headers: new Headers(context.request.headers),
      redirect: 'manual',
    };
    // CF request bodies can be a ReadableStream — pass through when present.
    if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
      init.body = context.request.body;
    }
    // Strip hop-by-hop headers per RFC 7230
    init.headers.delete('host');

    const proxied = await fetch(target.toString(), init);
    const headers = new Headers(proxied.headers);
    // Don't leak the upstream Host or cf headers to the client.
    headers.delete('cf-ray');
    headers.delete('server');
    return new Response(proxied.body, { status: proxied.status, headers });
  }

  return context.next();
};
