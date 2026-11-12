# Two-player networking foundation (not yet playable co-op)

This is a **real WebSocket server**, not a simulated second player. It supplies two-person room creation, joining, bounded message relay, disconnect notification and keepalive. It does **not** yet connect to the Three.js client, synchronize enemies, authenticate players, or implement authoritative combat, revive or anti-cheat. Do not advertise the game as multiplayer yet.

## Local run

From `multiplayer/`: `npm install && npm test && npm start`. The server listens on `PORT` (default 8787). Test coverage uses actual local WebSocket clients.

## Protocol

Open a WebSocket to the server. Host sends `{"type":"create"}`; server returns `{"type":"joined","room":"<8 hex digits>","playerId":"...","host":true}`. Guest sends `{"type":"join","room":"<8 hex digits>"}`; server returns joined with host false. Each side can then send `{"type":"state","data":{"x":0,"z":0}}` or `action`/`revive` messages with an object `data`. Messages are forwarded to the other connected player with the sender's playerId. The server does not validate gameplay coordinates or accept the relay as authoritative game state.

## Deployment and remaining blockers

Deploy this Node service on a public HTTPS-capable host with WebSocket upgrade support and configure a valid TLS certificate. Use `wss://` from Safari, never `ws://` on an HTTPS game page. A share link will need to carry the room code, and the client must implement room UI, serialization, remote character rendering, reconciliation, revive state and disconnect recovery. A production deployment should add authentication or signed room invites, explicit origin allowlists, authoritative simulation, state validation, abuse protection and metrics. There is no deployed server or proof of cross-device play yet. This standalone addition does not touch recorded audio, soundtrack, joystick, mobile layout or current single-player gameplay.

Unreal Engine Editor integration is also **not** established by this work; a Blender GLB export alone is not an Unreal connection.
