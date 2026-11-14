// Minimal real-network two-player room relay. Not a complete multiplayer game.
// Run: npm install && npm start. Deploy behind TLS (wss://) for iPhone Safari.
import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';

const port = Number(process.env.PORT || 8787);
const wss = new WebSocketServer({
  port,
  maxPayload: 2048,
  // Reject disallowed browser origins during the HTTP upgrade, before a
  // WebSocket session is established or any game packets can be exchanged.
  verifyClient: ({ origin }, done) => {
    if (origin && (ALLOWED_ORIGINS.size === 0 || !ALLOWED_ORIGINS.has(origin))) {
      done(false, 403, 'Origin not allowed');
    } else {
      done(true);
    }
  }
});
const rooms = new Map();
// Direct socket lookup avoids rebuilding every room's player list per heartbeat.
const peers = new WeakMap();
const MAX_ROOMS = 1000;
// A disconnected or stalled client must not leave an indefinitely revivable snapshot.
const REVIVE_STATE_MAX_AGE_MS = 1500;
// Prevent a held revive button or replayed packet from flooding a teammate.
const REVIVE_COOLDOWN_MS = 1000;
const ALLOWED_ORIGINS = new Set((process.env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean));
// Browser origins must be explicitly configured before public deployment.
const ALLOWED = new Set(['state', 'action', 'revive']);
const id = () => randomBytes(12).toString('hex');
const send = (ws, payload) => {
  if (ws.readyState !== WebSocket.OPEN) return false;
  // A socket can close between the readyState check and send. Never let a
  // single failed teammate transport crash the shared room relay process.
  try {
    ws.send(JSON.stringify(payload));
    return true;
  } catch {
    // A failed send is not a healthy room member. Force close cleanup so the
    // remaining teammate can recover and a replacement can join the room.
    // Termination itself can throw in transport shims; isolate that too.
    try { ws.terminate(); } catch { /* already unusable */ }
    return false;
  }
};
const closeRoomIfEmpty = (room) => {
  if (room.players.size === 0) rooms.delete(room.code);
};
wss.on('connection', (ws, request) => {
  const peer = { ws, room: null, playerId: id(), messages: 0, windowStart: Date.now(), alive: true, lastState: null, lastStateAt: 0, lastReviveAt: -Infinity };
  peers.set(ws, peer);
  // An errored transport must not emit an unhandled EventEmitter error and
  // terminate the shared relay. Termination triggers the normal close cleanup.
  ws.on('error', () => { try { ws.terminate(); } catch { /* already unusable */ } });
  ws.on('pong', () => { peer.alive = true; });
  ws.on('message', (raw) => {
    const now = Date.now();
    if (now - peer.windowStart >= 1000) { peer.windowStart = now; peer.messages = 0; }
    if (++peer.messages > 30) return ws.close(1008, 'Rate limit');
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return send(ws, { type: 'error', code: 'invalid_json' }); }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
    // Reject unknown envelope fields before routing. They must never become
    // a covert channel to future client handlers or room commands.
    const keys = Object.keys(msg);
    const expected = msg.type === 'create' ? ['type'] :
      msg.type === 'join' ? ['type', 'room'] :
      ALLOWED.has(msg.type) ? ['type', 'data'] : null;
    if (expected && (keys.length !== expected.length ||
        keys.some(key => !expected.includes(key)))) {
      return send(ws, { type: 'error', code: 'invalid_envelope' });
    }
    if (msg.type === 'create' && !peer.room) {
      if (rooms.size >= MAX_ROOMS) return send(ws, { type: 'error', code: 'server_full' });
      let code;
      do { code = randomBytes(12).toString('hex'); } while (rooms.has(code));
      const room = { code, players: new Map(), hostId: peer.playerId };
      rooms.set(code, room);
      room.players.set(peer.playerId, peer);
      peer.room = room;
      return send(ws, { type: 'joined', room: code, playerId: peer.playerId, host: true });
    }
    if (msg.type === 'join' && !peer.room) {
      if (typeof msg.room !== 'string' || !/^[a-f0-9]{24}$/.test(msg.room)) return send(ws, { type: 'error', code: 'invalid_room' });
      const room = rooms.get(msg.room);
      if (!room) return send(ws, { type: 'error', code: 'room_not_found' });
      if (room.players.size >= 2) return send(ws, { type: 'error', code: 'room_full' });
      room.players.set(peer.playerId, peer);
      peer.room = room;
      const hostPeer = [...room.players.values()].find(other => other !== peer);
      send(ws, { type: 'joined', room: room.code, playerId: peer.playerId, host: room.hostId === peer.playerId, peerId: hostPeer.playerId });
      for (const other of room.players.values()) if (other !== peer) send(other.ws, { type: 'peer_joined', playerId: peer.playerId });
      return;
    }
    if (!peer.room || !ALLOWED.has(msg.type)) return;
    // Relay only bounded, JSON-safe game payloads; never trust a client as authoritative.
    if (!msg.data || typeof msg.data !== 'object' || Array.isArray(msg.data)) return;
    // Actions are untrusted input. Only bounded primitive fields may cross the
    // network; nested payloads can otherwise reach future gameplay handlers.
    if (msg.type === 'action' && (Object.keys(msg.data).length > 8 ||
        Object.entries(msg.data).some(([key, value]) =>
          key.length > 32 || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key) ||
          !((typeof value === 'string' && value.length <= 64) ||
            typeof value === 'boolean' ||
            (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 10000))))) {
      return send(ws, { type: 'error', code: 'invalid_action' });
    }
    // Never relay malformed position values to another player's renderer.
    if (msg.type === 'state' && (!Number.isFinite(msg.data.x) || !Number.isFinite(msg.data.z) ||
        Math.abs(msg.data.x) > 10000 || Math.abs(msg.data.z) > 10000)) {
      return send(ws, { type: 'error', code: 'invalid_state' });
    }
    // Validate optional render/animation fields before another client's renderer sees them.
    // Do not silently coerce strings, nulls or out-of-range values into coordinates.
    if (msg.type === 'state') {
      const data = msg.data;
      if ((data.y !== undefined && (!Number.isFinite(data.y) || Math.abs(data.y) > 10000)) ||
          (data.yaw !== undefined && (!Number.isFinite(data.yaw) || Math.abs(data.yaw) > 10000)) ||
          (data.health !== undefined && (!Number.isFinite(data.health) || data.health < 0 || data.health > 100)) ||
          (data.downed !== undefined && typeof data.downed !== 'boolean')) {
        return send(ws, { type: 'error', code: 'invalid_state' });
      }
    }
    // Only relay the documented primitive snapshot fields. Unknown or nested
    // properties must not reach a teammate's Three.js rendering code.
    if (msg.type === 'state' && Object.keys(msg.data).some(key =>
      !['x', 'y', 'z', 'yaw', 'health', 'downed'].includes(key))) {
      return send(ws, { type: 'error', code: 'invalid_state' });
    }
    if (msg.type === 'state') {
      peer.lastState = { ...msg.data };
      peer.lastStateAt = now;
    }
    // A revive request may only target the currently connected teammate.
    // This is routing validation, not proof that the target is downed or in range.
    if (msg.type === 'revive') {
      const targetId = msg.data.targetId;
      // Revive is a fixed command: do not forward arbitrary nested properties.
      if (Object.keys(msg.data).length !== 1) {
        return send(ws, { type: 'error', code: 'invalid_revive_target' });
      }
      if (typeof targetId !== 'string' || targetId === peer.playerId ||
          !peer.room.players.has(targetId)) {
        return send(ws, { type: 'error', code: 'invalid_revive_target' });
      }
      if (now - peer.lastReviveAt < REVIVE_COOLDOWN_MS) {
        return send(ws, { type: 'error', code: 'revive_cooldown' });
      }
      const target = peer.room.players.get(targetId);
      const from = peer.lastState;
      const to = target.lastState;
      // This is proximity/downed validation of reported positions, not an authoritative simulation.
      if (!from || !to || now - peer.lastStateAt > REVIVE_STATE_MAX_AGE_MS ||
          now - target.lastStateAt > REVIVE_STATE_MAX_AGE_MS ||
          from.downed !== false || to.downed !== true ||
          Math.hypot(from.x - to.x, from.z - to.z,
            Number.isFinite(from.y) && Number.isFinite(to.y) ? from.y - to.y : 0) > 3.5 ||
          // Do not revive across different floors when both clients report height.
          (Number.isFinite(from.y) !== Number.isFinite(to.y)) ||
          (Number.isFinite(from.y) && Math.abs(from.y - to.y) > 2.5)) {
        return send(ws, { type: 'error', code: 'revive_not_allowed' });
      }
      // A rescue must not be acknowledged when delivery to the downed
      // teammate fails. In that case keep the snapshot/cooldown unchanged,
      // allowing a replacement peer to join after socket close cleanup.
      if (!send(target.ws, { type: 'revive', playerId: peer.playerId, data: msg.data })) {
        return send(ws, { type: 'error', code: 'revive_delivery_failed' });
      }
      peer.lastReviveAt = now;
      // Consume the downed snapshot after one accepted revive. A held button
      // must not replay a successful rescue once the cooldown expires.
      // The game client still owns health restoration until authoritative sync exists.
      target.lastState = { ...to, downed: false };
      // This confirms relay delivery only, not authoritative health restoration.
      return send(ws, { type: 'revive_accepted', targetId });
    }
    for (const other of peer.room.players.values()) {
      if (other !== peer) send(other.ws, { type: msg.type, playerId: peer.playerId, data: msg.data });
    }
  });
  ws.on('close', () => {
    if (!peer.room) return;
    const room = peer.room;
    room.players.delete(peer.playerId);
    if (room.hostId === peer.playerId && room.players.size) {
      const successor = room.players.values().next().value;
      room.hostId = successor.playerId;
      send(successor.ws, { type: 'host_changed', playerId: successor.playerId });
    }
    for (const other of room.players.values()) send(other.ws, { type: 'peer_left', playerId: peer.playerId });
    closeRoomIfEmpty(room);
    peer.room = null;
  });
});
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    const peer = peers.get(ws);
    if (!peer || !peer.alive) { try { ws.terminate(); } catch { /* already unusable */ } continue; }
    peer.alive = false;
    // Transport errors can occur between heartbeat inspection and ping.
    // Isolate the failed socket rather than crashing the shared relay.
    try { ws.ping(); } catch { try { ws.terminate(); } catch { /* already unusable */ } }
  }
}, 30000);
wss.on('close', () => clearInterval(heartbeat));
console.log('Co-op signalling relay listening on port ' + port);
