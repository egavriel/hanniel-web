/*
  /g/<code> — the recipient's gift card page.

  Serves the static gift/card.html shell, but rewrites the <title> and
  Open Graph tags first so the WhatsApp link preview reads
  "Erwin sent you 6 Overnight Oats 🎁" instead of a generic page title.
  The card itself renders client-side from /api/gift/card/<code>.
*/

import { CATALOG, loadGift, firstName } from '../_lib/gift.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function onRequestGet(context) {
  const { env, params, request } = context;
  const shell = await env.ASSETS.fetch(new URL('/gift/card', request.url));
  let html = await shell.text();

  const code = String(params.code || '').toUpperCase();
  let gift = null;
  try { gift = env.GIFT_DB ? await loadGift(env, code) : null; } catch { gift = null; }

  if (gift && gift.status !== 'cancelled') {
    const item = CATALOG[gift.line] || { name: 'treats', emoji: '🎁' };
    const title = `${firstName(gift.sender_name)} sent you ${gift.units_total} ${item.name} 🎁`;
    const desc = `A Little Hanniel e-Gift for ${gift.recipient_name || 'you'}. Tap to unwrap — fresh from our kitchen.`;
    html = html
      .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
      .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(title)}`)
      .replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(desc)}`)
      .replace(/(<meta name="description" content=")[^"]*/, `$1${esc(desc)}`);
  }

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
