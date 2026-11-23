// Preserve the original API while using the canonical fragment invitation format.
// Room capabilities must not appear in HTTP request URLs or analytics query strings.
import { makeInviteLink, readInviteRoom } from './invite-link.mjs';

export function createRoomInvite(pageUrl, roomCode) {
  const url = new URL(pageUrl);
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new TypeError('Invites require a credential-free HTTPS game URL');
  // Never forward unrelated query parameters, which may contain private tokens.
  url.search = '';
  return makeInviteLink(url.href, roomCode);
}

export function readRoomInvite(pageUrl) {
  let url;
  try { url = new URL(pageUrl); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.search) return null;
  return readInviteRoom(url.href);
}
