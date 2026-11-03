# Geese With Teeth — real two-player networking plan

GitHub Pages can host the client, but it cannot relay live player state. Real share-link co-op therefore needs one small realtime service. Do not simulate a second remote player locally or label AI as multiplayer.

## Smallest backend

The repository now contains `multiplayer-worker.js`, a minimal Cloudflare Worker + Durable Object WebSocket relay. A comparable stateful WebSocket service can replace it, but static GitHub Pages alone cannot provide real two-player networking.

### Room flow

1. Host taps **Create co-op room**.
2. Client `POST`s `/room` and receives a cryptographically random room id.
3. Share URL is `?room=<id>`; no player data or secrets go in the URL.
4. Both clients connect by WebSocket to `/room/<id>`.
5. The room accepts at most two active player sockets and rejects a third gameplay peer.
6. Mummy/Phoenix choice is kept unique by the relay.
7. The Durable Object owns short-lived room state; no fake local second player is created.

## Protocol implemented today

The relay currently accepts these sequenced client messages:

```json
{"t":"input","seq":42,"move":[0.2,-0.8],"yaw":1.4,"pitch":-0.1,"sprint":true,"fire":false}
{"t":"state","seq":43,"x":12.4,"z":-8.1}
{"t":"character","seq":44,"character":"Mummy"}
{"t":"damage","seq":45,"amount":20}
{"t":"revive_start","seq":46,"target":"p2"}
{"t":"revive_cancel","seq":47,"target":"p2"}
```

Input and position state are rate-limited to 20 Hz. Sequence numbers are monotonic per channel so stale/replayed packets cannot become current later. Positions are finite-number checked, world-bounded and speed-checked. Downed players cannot move.

The relay sends `welcome`, `peer_joined`, `peer_left`, `input`, `state`, `character`, `health`, `revive_started`, `revive_cancelled` and `revived` messages. Clients should interpolate the remote teammate between state packets while keeping the local player prediction-first so touch controls remain responsive on iPhone.

## Downed / revive contract implemented today

A valid damage report can reduce the reporting player's relay-owned HP to zero and put that player into `downed`. A living teammate with fresh authoritative position state can start a revive only inside the 2.4-unit revive radius. The relay times the three-second hold and restores 35 HP on success.

Revive completion is revalidated server-side. It is cancelled if the reviver disconnects, becomes downed, stops supplying fresh state, leaves range, explicitly cancels, or the target is no longer downed. The downed player's position is frozen and must have been trustworthy at the moment they went down.

## Important authority boundary

The relay is authoritative for room membership, character uniqueness, accepted position envelope, HP after accepted damage, downed state and revive completion. It is **not yet authoritative for goose AI or hit detection**.

Today the browser reports damage inflicted on its own local player. The relay validates the amount, applies a per-hit ceiling and cooldown, owns the resulting HP/downed transition, and prevents packet replay. This is sufficient for honest private co-op plumbing, but it is not cheat-resistant combat authority. Do not describe it as server-authoritative goose damage.

The smallest next backend step for cheat-resistant combat is to move deterministic goose state/hit resolution into the Durable Object (or another authoritative simulation service) and have clients send attack/input intent rather than self-reported damage. That is deliberately deferred until the browser client is actually wired to the relay and real two-device play is verified.

## Security / robustness already present

- Cryptographically random, URL-safe room ids.
- Two-player room cap.
- Maximum WebSocket message size.
- Packet shape/value checks and coordinate bounds.
- 20 Hz input/state rate limits.
- Monotonic per-channel sequence numbers with replay-resistant handling for throttled packets.
- Movement-speed envelope checks.
- Damage amount ceiling and damage cooldown.
- Server-timed revive with proximity and state-freshness checks.

## Still required before calling multiplayer playable

- Wire the browser client to room creation/join and the WebSocket protocol.
- Render/interpolate the remote teammate.
- Send local goose-bite damage into the relay and consume relay health/downed updates locally.
- Connect the revive interaction/UI to `revive_start`, `revive_cancelled` and `revived`.
- Decide reconnect behaviour and add heartbeat/idle cleanup if real-device testing shows it is needed.
- Test host + guest on two physical devices over `wss://`.

## Deployment boundary

The current GitHub Pages build remains playable solo without the backend. Multiplayer UI must only be exposed after a relay URL is configured and the client integration above exists. Until then, the game should say multiplayer is unavailable rather than presenting simulated network play.
