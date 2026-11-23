// Preserve the original API while using the canonical fragment invitation format.
// Room capabilities must not appear in HTTP request URLs or analytics query strings.
import { makeInviteLink, readInviteRoom } from './invite-link.mjs';

export function createRoomInvite(pageUrl, roomCode) {
  // The canonical validator permits HTTPS publicly and HTTP only on loopback
  // for local development. It also strips private query parameters.
  return makeInviteLink(pageUrl, roomCode);
}

export function readRoomInvite(pageUrl) {
  // Use exactly the same origin and query validation as the canonical reader.
  return readInviteRoom(pageUrl);
}
