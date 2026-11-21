// Share only a room invitation, never a WebSocket credential or a simulated peer.
// The game UI must still connect to a deployed WSS relay and join this room.
const ROOM_RE = /^[a-f0-9]{24}$/;

export function createRoomInvite(pageUrl, roomCode) {
  if (!ROOM_RE.test(roomCode)) throw new TypeError('Invalid room code');
  const url = new URL(pageUrl);
  if (url.protocol !== 'https:') throw new TypeError('Invites require HTTPS');
  if (url.username || url.password) throw new TypeError('Credential-bearing URLs are not shareable');
  // Remove existing fragments and stale invitations rather than forwarding
  // unrelated private parameters from the host's browser address bar.
  url.hash = '';
  url.search = '';
  url.searchParams.set('room', roomCode);
  return url.toString();
}

export function readRoomInvite(pageUrl) {
  let url;
  try { url = new URL(pageUrl); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
  const codes = url.searchParams.getAll('room');
  // Refuse extra parameters instead of treating a link with embedded tokens
  // or conflicting routing hints as a clean room invitation.
  return [...url.searchParams.keys()].length === 1 &&
    codes.length === 1 && ROOM_RE.test(codes[0]) ? codes[0] : null;
}
