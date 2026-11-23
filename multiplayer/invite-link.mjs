// Share only the room capability in the URL fragment, never the relay endpoint.
// This module does not imply playable co-op until the game consumes the invite.
const ROOM_RE = /^[a-f0-9]{24}$/;
export function makeInviteLink(pageUrl, room) {
  if (typeof room !== 'string' || !ROOM_RE.test(room)) throw new TypeError('Invalid room code');
  const url = new URL(pageUrl);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new TypeError('Invalid game URL');
  url.hash = 'coop=' + room;
  return url.href;
}
export function readInviteRoom(pageUrl) {
  let url;
  try { url = new URL(pageUrl); } catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol)) return null;
  // No duplicate keys, unrelated fragments or percent-encoded ambiguity.
  const match = /^#coop=([a-f0-9]{24})$/.exec(url.hash);
  return match ? match[1] : null;
}
