// Browser-side transport only. No fake local multiplayer or health authority.
export function createCoopClient({ url, WebSocketImpl = globalThis.WebSocket, onEvent = () => {} }) {
  if (!/^wss:\/\//.test(url)) throw new Error('Public multiplayer requires wss://');
  if (typeof WebSocketImpl !== 'function') throw new Error('WebSocket unavailable');
  let socket = null;
  let generation = 0;
  let room = null;
  let playerId = null;
  let peerId = null;
  const validId = (value) => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
  const emit = (type, data = {}) => onEvent({ type, ...data });
  const send = (packet) => {
    if (!socket || socket.readyState !== WebSocketImpl.OPEN) return false;
    // Avoid crashing the render loop on cyclic data, oversized snapshots or a closing socket.
    try {
      const encoded = JSON.stringify(packet);
      if (!encoded || encoded.length > 2048) return false;
      socket.send(encoded);
      return true;
    } catch {
      return false;
    }
  };
  function connect() {
    if (socket) throw new Error('Already connected; disconnect first');
    const ws = new WebSocketImpl(url);
    socket = ws;
    const current = ++generation;
    ws.addEventListener('open', () => {
      if (current === generation) emit('connected');
    });
    ws.addEventListener('message', ({ data }) => {
      if (current !== generation || typeof data !== 'string' || data.length > 4096) return;
      let packet;
      try { packet = JSON.parse(data); } catch { return; }
      if (!packet || typeof packet !== 'object' || Array.isArray(packet) || typeof packet.type !== 'string') return;
      if (packet.type === 'joined') {
        if (room || !validId(packet.room) || !validId(packet.playerId) || (packet.peerId != null && (!validId(packet.peerId) || packet.peerId === packet.playerId))) return;
        room = packet.room;
        playerId = packet.playerId;
        peerId = packet.peerId || null;
      } else if (packet.type === 'peer_joined') {
        if (!room || !validId(packet.playerId) || packet.playerId === playerId || (peerId && peerId !== packet.playerId)) return;
        peerId = packet.playerId;
      } else if (packet.type === 'peer_left') {
        if (!room || !peerId || peerId !== packet.playerId) return;
        peerId = null;
      }
      emit('packet', { packet });
    });
    ws.addEventListener('close', () => {
      if (current !== generation) return;
      socket = null; room = null; playerId = null; peerId = null;
      emit('disconnected');
    });
    ws.addEventListener('error', () => {
      if (current === generation) emit('connection_error');
    });
  }
  function disconnect() {
    ++generation;
    const old = socket;
    socket = null; room = null; playerId = null; peerId = null;
    if (old) old.close();
  }
  return {
    connect, disconnect,
    createRoom: () => send({ type: 'create' }),
    joinRoom: (code) => /^[a-f0-9]{24}$/.test(code) && send({ type: 'join', room: code }),
    sendState: (data) => !!room && send({ type: 'state', data }),
    sendAction: (data) => !!room && send({ type: 'action', data }),
    revive: (targetId) => !!room && validId(targetId) && targetId === peerId && send({ type: 'revive', data: { targetId } }),
    get status() { return { connected: !!socket && socket.readyState === WebSocketImpl.OPEN, room, playerId, peerId }; }
  };
}
