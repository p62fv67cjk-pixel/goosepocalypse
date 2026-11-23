// Share only the room capability in the URL fragment, never the relay endpoint.
// This module does not imply playable co-op until the game consumes the invite.
const ROOM_RE = /^[a-f0-9]{24}$/;
// An HTTP page can be modified in transit and steal the fragment capability.
// Keep loopback HTTP for local development, but require HTTPS for public invites.
const safeGameUrl = (url) => (url.protocol === 'https:' ||
  (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) &&
  !url.username && !url.password;
export function makeInviteLink(pageUrl, room) {
  if (typeof room !== 'string' || !ROOM_RE.test(room)) throw new TypeError('Invalid room code');
  const url = new URL(pageUrl);
  if (!safeGameUrl(url)) throw new TypeError('Invalid game URL');
  url.search = '';
  url.hash = 'coop=' + room;
  return url.href;
}
export function readInviteRoom(pageUrl) {
  let url;
  try { url = new URL(pageUrl); } catch { return null; }
  if (!safeGameUrl(url) || url.search) return null;
  const match = /^#coop=([a-f0-9]{24})$/.exec(url.hash);
  return match ? match[1] : null;
}
