// Browser-side transport only. No fake local multiplayer or health authority.
export function createCoopClient({ url, WebSocketImpl = globalThis.WebSocket, onEvent = () => {}, now = () => Date.now(), cryptoImpl = globalThis.crypto }) {
  if (!/^wss:\/\//.test(url)) throw new Error('Public multiplayer requires wss://');
  if (typeof WebSocketImpl !== 'function') throw new Error('WebSocket unavailable');
  let socket = null;
  let generation = 0;
  let room = null;
  let playerId = null;
  let peerId = null;
  let roomRequestPending = false;
  let requestedRoom = null;
  let pendingKind = null;
  let pendingReviveTarget = null;
  let pendingReviveAt = null;
  let pendingReviveRequestId = null;
  let lastStateSentAt = -Infinity;
  // A 60fps render loop must not trip the relay's 30-message/second disconnect limit.
  const STATE_INTERVAL_MS = 100;
  const validId = (value) => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
  const emit = (type, data = {}) => onEvent({ type, ...data });
  // Apply the same bounded snapshot contract before sending as when receiving.
  const validState = (d) => !!d && typeof d === 'object' && !Array.isArray(d) &&
    Number.isFinite(d.x) && Number.isFinite(d.z) &&
    Math.abs(d.x) <= 10000 && Math.abs(d.z) <= 10000 &&
    Object.keys(d).every(key => ['x', 'y', 'z', 'yaw', 'health', 'downed'].includes(key)) &&
    (d.y === undefined || (Number.isFinite(d.y) && Math.abs(d.y) <= 10000)) &&
    (d.yaw === undefined || (Number.isFinite(d.yaw) && Math.abs(d.yaw) <= 10000)) &&
    (d.health === undefined || (Number.isFinite(d.health) && d.health >= 0 && d.health <= 100)) &&
    (d.downed === undefined || typeof d.downed === 'boolean');
  // Mirror relay action constraints locally so invalid input never consumes bandwidth.
  const validAction = (data) => !!data && typeof data === 'object' && !Array.isArray(data) &&
    Object.keys(data).length <= 8 && Object.entries(data).every(([key, value]) =>
      key.length <= 32 && /^[a-zA-Z][a-zA-Z0-9_]*$/.test(key) &&
      ((typeof value === 'string' && value.length <= 64) ||
       typeof value === 'boolean' ||
       (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 10000)));
  const send = (packet) => {
    if (!socket || socket.readyState !== WebSocketImpl.OPEN) return false;
    // Avoid crashing the render loop on cyclic data, oversized snapshots or a closing socket.
    try {
      const encoded = JSON.stringify(packet);
      // Relay enforces bytes, not UTF-16 code units (emoji/non-ASCII can exceed the limit).
      if (!encoded || new TextEncoder().encode(encoded).byteLength > 2048) return false;
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
      if (current !== generation || typeof data !== 'string' || new TextEncoder().encode(data).byteLength > 4096) return;
      let packet;
      try { packet = JSON.parse(data); } catch { return; }
      if (!packet || typeof packet !== 'object' || Array.isArray(packet) || typeof packet.type !== 'string') return;
      // Only documented relay events may reach game UI handlers.
      if (!['joined', 'peer_joined', 'peer_left', 'state', 'action', 'revive',
        'revive_accepted', 'host_changed', 'error'].includes(packet.type)) return;
      if (packet.type === 'joined') {
        if (room || !roomRequestPending || ![3, 4, 5].includes(Object.keys(packet).length) ||
            !Object.keys(packet).every(key => ['type', 'room', 'playerId', 'host', 'peerId'].includes(key)) ||
            (Object.hasOwn(packet, 'host') && typeof packet.host !== 'boolean') ||
            (Object.hasOwn(packet, 'peerId') && packet.peerId == null) ||
            (requestedRoom && packet.room !== requestedRoom) || !validId(packet.room) || !validId(packet.playerId) ||
            (packet.peerId != null && (!validId(packet.peerId) || packet.peerId === packet.playerId))) return;
        lastStateSentAt = -Infinity;
        roomRequestPending = false;
        requestedRoom = null;
        pendingKind = null;
        room = packet.room;
        playerId = packet.playerId;
        peerId = packet.peerId || null;
        pendingReviveTarget = null; pendingReviveAt = null; pendingReviveRequestId = null;
      } else if (packet.type === 'error') {
        // Relay errors are fixed control envelopes, not arbitrary game data.
        // Reject malformed or extended packets before they can change lobby or revive state.
        if (Object.keys(packet).length !== 2 || !Object.hasOwn(packet, 'code') ||
            typeof packet.code !== 'string' || !/^[a-z_]{1,48}$/.test(packet.code)) return;
        // The relay rejects invalid/full room requests without closing the socket.
        // Permit a corrected request instead of leaving the lobby stuck.
        // Only a lobby rejection can release a pending create/join request.
        // Gameplay errors or malformed packets must not unlock duplicate requests.
        if (roomRequestPending && ((pendingKind === 'create' && packet.code === 'server_full') || (pendingKind === 'join' && ['invalid_room', 'room_not_found', 'room_full'].includes(packet.code)))) { roomRequestPending = false; requestedRoom = null; pendingKind = null; }
        // A rejected revive cannot later be confirmed by a delayed or forged acknowledgement.
        // Clear only revive-specific errors; unrelated gameplay errors must not cancel it.
        if (['invalid_revive_target', 'revive_cooldown', 'revive_not_allowed', 'revive_delivery_failed'].includes(packet.code)) {
          pendingReviveTarget = null;
          pendingReviveAt = null;
        }
      } else if (packet.type === 'peer_joined') {
        if (!room || Object.keys(packet).length !== 2 || !validId(packet.playerId) || packet.playerId === playerId || peerId) return;
        peerId = packet.playerId;
      } else if (packet.type === 'peer_left') {
        if (!room || Object.keys(packet).length !== 2 || !peerId || peerId !== packet.playerId) return;
        peerId = null;
        pendingReviveTarget = null; pendingReviveAt = null; pendingReviveRequestId = null;
      } else if (!room && packet.type !== 'error') {
        // Do not expose gameplay packets before room membership is established.
        return;
      } else if (['state', 'action', 'revive'].includes(packet.type) &&
          (!peerId || packet.playerId !== peerId)) {
        // Only the currently announced teammate may produce gameplay events.
        // A departed or replaced peer must not drive the renderer or revive UI.
        return;
      }
      // Treat network snapshots as untrusted even when the relay is expected to validate.
      // Never hand malformed positions or nested data to Three.js gameplay handlers.
      if (packet.type === 'state' || packet.type === 'action') {
        // Relay gameplay envelopes have exactly three fields. Reject injected
        // metadata before it reaches a future renderer or action handler.
        if (Object.keys(packet).length !== 3 ||
            !Object.keys(packet).every(key => ['type', 'playerId', 'data'].includes(key))) return;
        if (packet.type === 'state' && !validState(packet.data)) return;
        if (packet.type === 'action' && !validAction(packet.data)) return;
      }
      // Control acknowledgements are also untrusted. Never show a rescue for
      // an unrelated target, or a host transition for another player.
      if (packet.type === 'revive_accepted') {
        // Only the relay's documented acknowledgement shape is accepted.
        // Extra fields must never be interpreted as future gameplay authority.
        if (![2, 3].includes(Object.keys(packet).length) || !Object.hasOwn(packet, 'targetId') ||
            !Object.keys(packet).every(key => ['type', 'targetId', 'requestId'].includes(key)) ||
            (Object.hasOwn(packet, 'requestId') && !validId(packet.requestId)) ||
            (pendingReviveRequestId !== null && packet.requestId !== pendingReviveRequestId) ||
            (pendingReviveRequestId === null && Object.hasOwn(packet, 'requestId'))) return;
        // An acknowledgement arriving after the retry window is stale. Without
        // per-attempt IDs, it must not report a successful current rescue.
        let timestamp;
        try { timestamp = now(); } catch { return; }
        if (!Number.isFinite(timestamp) || pendingReviveAt === null ||
            timestamp < pendingReviveAt || timestamp - pendingReviveAt >= 5000 ||
            !peerId || packet.targetId !== peerId || pendingReviveTarget !== peerId) return;
      }
      if (packet.type === 'revive_accepted') { pendingReviveTarget = null; pendingReviveAt = null; pendingReviveRequestId = null; }
      if (packet.type === 'host_changed' && (Object.keys(packet).length !== 2 || packet.playerId !== playerId || !validId(packet.playerId))) return;
      if (packet.type === 'revive' &&
          (Object.keys(packet).length !== 3 ||
           !Object.keys(packet).every(key => ['type', 'playerId', 'data'].includes(key)) ||
           !packet.data || typeof packet.data !== 'object' || Array.isArray(packet.data) ||
           !Object.keys(packet.data).every(key => ['targetId', 'requestId'].includes(key)) ||
           Object.keys(packet.data).length !== (Object.hasOwn(packet.data, 'requestId') ? 2 : 1) ||
           (Object.hasOwn(packet.data, 'requestId') && !validId(packet.data.requestId)) ||
           packet.data.targetId !== playerId)) return;
      emit('packet', { packet });
    });
    ws.addEventListener('close', () => {
      if (current !== generation) return;
      socket = null; room = null; playerId = null; peerId = null; roomRequestPending = false; requestedRoom = null; pendingKind = null; pendingReviveTarget = null; pendingReviveAt = null; pendingReviveRequestId = null; lastStateSentAt = -Infinity;
      emit('disconnected');
    });
    ws.addEventListener('error', () => {
      if (current === generation) emit('connection_error');
    });
  }
  function disconnect() {
    ++generation;
    const old = socket;
    socket = null; room = null; playerId = null; peerId = null; roomRequestPending = false; requestedRoom = null; pendingKind = null; pendingReviveTarget = null; pendingReviveAt = null; pendingReviveRequestId = null; lastStateSentAt = -Infinity;
    if (old) {
      // A browser/WebSocket shim can throw during close. Local teardown is
      // already complete, so do not let that exception break the game UI.
      try { old.close(); } catch { /* local state is already disconnected */ }
      emit('disconnected');
    }
  }
  const api = {
    connect, disconnect,
    // Room membership is single-use per connection. A second create/join request
    // after joining would be rejected by the relay and confuse the game UI.
    createRoom: () => {
      if (room || roomRequestPending || !send({ type: 'create' })) return false;
      roomRequestPending = true;
      pendingKind = 'create';
      requestedRoom = null;
      return true;
    },
    joinRoom: (code) => {
      if (room || roomRequestPending || typeof code !== 'string' || !/^[a-f0-9]{24}$/.test(code) || !send({ type: 'join', room: code })) return false;
      roomRequestPending = true;
      pendingKind = 'join';
      requestedRoom = code;
      return true;
    },
    sendState: (data) => {
      if (!room || !validState(data)) return false;
      // A broken clock provider must not throw through the iPhone render loop.
      let timestamp;
      try { timestamp = now(); } catch { return false; }
      if (!Number.isFinite(timestamp)) return false;
      // Wall clocks can jump backwards on mobile; recover instead of freezing updates.
      if (timestamp >= lastStateSentAt && timestamp - lastStateSentAt < STATE_INTERVAL_MS) return false;
      if (!send({ type: 'state', data })) return false;
      lastStateSentAt = timestamp;
      return true;
    },
    sendAction: (data) => !!room && validAction(data) && send({ type: 'action', data }),
    revive: (targetId, requestId = null) => {
      // Lost relay responses must not permanently disable the revive button.
      // Expire the outstanding request after five seconds; the relay still
      // enforces proximity, downed state and its own cooldown on every retry.
      let timestamp;
      try { timestamp = now(); } catch { return false; }
      if (!Number.isFinite(timestamp)) return false;
      // A backwards wall-clock jump must not bypass the in-flight revive guard.
      // Clear the request only after a full, forward-moving timeout.
      if (pendingReviveTarget && pendingReviveAt !== null &&
          (timestamp < pendingReviveAt || timestamp - pendingReviveAt < 5000)) return false;
      if (requestId !== null && !validId(requestId)) return false;
      if (!room || !validId(targetId) || targetId !== peerId ||
          !send({ type: 'revive', data: requestId === null ? { targetId } : { targetId, requestId } })) return false;
      pendingReviveTarget = targetId;
      pendingReviveAt = timestamp;
      pendingReviveRequestId = requestId;
      return true;
    },
    // Prefer this for new UI integrations. Never substitute predictable Math.random IDs.
    // Legacy revive(targetId) remains available for older clients and fixtures.
    reviveWithGeneratedId: (targetId) => {
      if (!cryptoImpl || typeof cryptoImpl.getRandomValues !== 'function') return false;
      let bytes;
      try { bytes = cryptoImpl.getRandomValues(new Uint8Array(12)); } catch { return false; }
      if (!(bytes instanceof Uint8Array) || bytes.length !== 12) return false;
      const requestId = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      return api.revive(targetId, requestId);
    },
    get status() { return { connected: !!socket && socket.readyState === WebSocketImpl.OPEN, room, playerId, peerId }; }
  };
  return api;
}
