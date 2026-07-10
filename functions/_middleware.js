/*
  CF Pages Function — branch-routing middleware.

  Routes `staging.little.hanniel.co` requests to the staging branch's
  preview deployment (`staging.hanniel-web.pages.dev`).

  API routes (/api/*) run on this project (D1 EVENTS_DB binding).
*/

const STAGING_HOST = 'staging.little.hanniel.co';
const STAGING_TARGET = 'staging.hanniel-web.pages.dev';

export const onRequest = async (context) => {
  const url = new URL(context.request.url);
  const host = url.hostname.toLowerCase();

  if (url.pathname.startsWith('/api/')) {
    return context.next();
  }

  if (host === STAGING_HOST) {
    const target = new URL(context.request.url);
    target.hostname = STAGING_TARGET;
    target.protocol = 'https:';

    const init = {
      method: context.request.method,
      headers: new Headers(context.request.headers),
      redirect: 'manual',
    };
    if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
      init.body = context.request.body;
    }
    init.headers.delete('host');

    const proxied = await fetch(target.toString(), init);
    const headers = new Headers(proxied.headers);
    headers.delete('cf-ray');
    headers.delete('server');
    return new Response(proxied.body, { status: proxied.status, headers });
  }

  return context.next();
};