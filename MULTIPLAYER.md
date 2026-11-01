# Geese With Teeth — real two-player networking plan

GitHub Pages can host the client, but it cannot relay live player state. Real share-link co-op therefore needs one small realtime service. Do not simulate a second remote player locally or label AI as multiplayer.

## Smallest backend

Use a tiny WebSocket room relay (Cloudflare Durable Object/WebSocket, Fly.io/Node `ws`, or equivalent). The relay owns no game rendering and stores only short-lived room state.

### Room flow

1. Host taps **Create co-op room**.
2. Client requests a cryptographically random room id from the relay.
3. Share URL is `?room=<id>`; no player data or secrets go in the URL.
4. Second player opens the link and joins the same room.
5. Server allows at most two active player sockets per room and rejects a third gameplay peer.
6. Mummy/Phoenix choice is authoritative per slot. If both request the same character, host keeps the choice and guest receives the other character.
7. Empty rooms expire automatically.

## State model

The relay should be authoritative for room membership, wave seed, enemy IDs, damage, downs/revives, pickups and score. Clients send input/state intent, not arbitrary HP/score values.

High-frequency packets (10–15 Hz):

```json
{"t":"input","seq":42,"move":[0.2,-0.8],"yaw":1.4,"pitch":-0.1,"sprint":true,"fire":false}
```

Low-frequency/event packets:

```json
{"t":"event","seq":43,"kind":"fire","weapon":"primary"}
{"t":"event","seq":44,"kind":"revive_start","target":"p2"}
```

Server snapshots:

```json
{"t":"snapshot","tick":1201,"players":[],"enemies":[],"wave":4,"seed":91822}
```

Clients interpolate the remote teammate and enemies between snapshots. The local player remains prediction-first so touch controls do not feel laggy on iPhone.

## Downed / revive contract

A player reaching zero HP enters `downed` instead of immediately ending the run. A living teammate within revive radius can hold revive for a server-timed duration. Damage or leaving the radius cancels it. Successful revive restores a difficulty-scaled fraction of max HP and grants a short invulnerability window. If both players are down simultaneously, the run ends.

For solo play, the existing AI teammate uses the same state contract locally. That keeps the mechanic compatible with later network co-op rather than building two unrelated revive systems.

## Security / robustness

- `wss://` only.
- Validate every packet and clamp movement/fire rates server-side.
- Monotonic sequence numbers; ignore stale packets.
- Random room ids with enough entropy to resist guessing.
- No authentication required for the first private share-link version, but room ids are capabilities and must never be logged publicly.
- Heartbeats remove dead sockets and allow a brief reconnect grace period.
- Never trust client-reported kills, score, HP, ammo, revive completion or pickup ownership.

## Deployment boundary

The current GitHub Pages build remains fully playable solo with no backend. Multiplayer UI should only appear after a relay URL is configured. Until then, the game must say multiplayer is unavailable rather than presenting fake network play.
