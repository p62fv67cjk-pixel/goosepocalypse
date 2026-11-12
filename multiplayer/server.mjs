// Minimal real-network two-player room relay. Not a complete multiplayer game.
// Run: npm install && npm start. Deploy behind TLS (wss://) for iPhone Safari.
import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';

const port = Number(process.env.PORT || 8787);
const wss = new WebSocketServer({ port, maxPayload: 2048 });
const rooms = new Map();
const MAX_ROOMS = 1000;
const ALLOWED_ORIGINS = new Set((process.env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean));
// Browser origins must be explicitly configured before public deployment.
const ALLOWED = new Set(['state', 'action', 'revive']);
const id = () => randomBytes(12).toString('hex');
const send = (ws, payload) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
};
const closeRoomIfEmpty = (room) => {
  if (room.players.size === 0) rooms.delete(room.code);
};
wss.on('connection', (ws, request) => {
  const origin = request.headers.origin;
  if (origin && (ALLOWED_ORIGINS.size === 0 || !ALLOWED_ORIGINS.has(origin))) {
    ws.close(1008, 'Origin not allowed');
    return;
  }
  const peer = { ws, room: null, playerId: id(), messages: 0, windowStart: Date.now(), alive: true };
  ws.on('pong', () => { peer.alive = true; });
  ws.on('message', (raw) => {
    const now = Date.now();
    if (now - peer.windowStart >= 1000) { peer.windowStart = now; peer.messages = 0; }
    if (++peer.messages > 30) return ws.close(1008, 'Rate limit');
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return send(ws, { type: 'error', code: 'invalid_json' }); }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
    if (msg.type === 'create' && !peer.room) {
      if (rooms.size >= MAX_ROOMS) return send(ws, { type: 'error', code: 'server_full' });
      let code;
      do { code = randomBytes(4).toString('hex'); } while (rooms.has(code));
      const room = { code, players: new Map() };
      rooms.set(code, room);
      room.players.set(peer.playerId, peer);
      peer.room = room;
      return send(ws, { type: 'joined', room: code, playerId: peer.playerId, host: true });
    }
    if (msg.type === 'join' && !peer.room) {
      if (typeof msg.room !== 'string' || !/^[a-f0-9]{8}$/.test(msg.room)) return send(ws, { type: 'error', code: 'invalid_room' });
      const room = rooms.get(msg.room);
      if (!room) return send(ws, { type: 'error', code: 'room_not_found' });
      if (room.players.size >= 2) return send(ws, { type: 'error', code: 'room_full' });
      room.players.set(peer.playerId, peer);
      peer.room = room;
      send(ws, { type: 'joined', room: room.code, playerId: peer.playerId, host: false });
      for (const other of room.players.values()) if (other !== peer) send(other.ws, { type: 'peer_joined', playerId: peer.playerId });
      return;
    }
    if (!peer.room || !ALLOWED.has(msg.type)) return;
    // Relay only bounded, JSON-safe game payloads; never trust a client as authoritative.
    if (!msg.data || typeof msg.data !== 'object' || Array.isArray(msg.data)) return;
    for (const other of peer.room.players.values()) {
      if (other !== peer) send(other.ws, { type: msg.type, playerId: peer.playerId, data: msg.data });
    }
  });
  ws.on('close', () => {
    if (!peer.room) return;
    const room = peer.room;
    room.players.delete(peer.playerId);
    for (const other of room.players.values()) send(other.ws, { type: 'peer_left', playerId: peer.playerId });
    closeRoomIfEmpty(room);
    peer.room = null;
  });
});
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    const peer = [...rooms.values()].flatMap(room => [...room.players.values()]).find(p => p.ws === ws);
    if (peer && !peer.alive) { ws.terminate(); continue; }
    if (peer) peer.alive = false;
    ws.ping();
  }
}, 30000);
wss.on('close', () => clearInterval(heartbeat));
console.log('Co-op signalling relay listening on port ' + port);
