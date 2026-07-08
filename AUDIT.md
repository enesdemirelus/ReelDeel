# ReelDuel Audit — Findings & Fix Tracker

> Generated 2026-07-08 by a multi-agent audit (4 mappers, 5 dimension finders — security / correctness / UI-UX / platform / edge-cases — every finding adversarially verified). 29 claims confirmed, 6 refuted. Duplicates merged → **26 distinct issues** in **6 fix clusters**.

## How to use this file (instructions for Claude)

- Each issue has a status marker: `[ ]` open, `[x]` fixed, `[~]` partially fixed / mitigated, `[-]` won't fix (add reason).
- **When you fix an issue, flip its marker and add a line `Fixed: <date> — <what was done, commit if known>` under it.**
- Each cluster has a `**Cluster status:**` line — update it to `DONE` only when every issue inside is `[x]` or `[-]`.
- Line numbers were accurate at audit time (commit `ee00609`). Code moves; treat them as hints, verify before editing.
- If a fix changes behavior described in the "How the app works" section, update that section too.

---

## How the app works (map, at audit time)

1. **Cold start** — `src/app/_layout.tsx` loads Unbounded fonts + `ensureAuth()` (Firebase anonymous auth); renders headerless `<Stack>` once both settle.
2. **Home** (`src/app/index.tsx`) — buttons push `/create` or `/join`.
3. **Create** (`src/app/create.tsx`) — host sets name, mode (bracket / KOTH), movie source, lobby timer. Host-sourced pool → push `/movies`. `onCreate` → `createRoom()` (`src/state/room.ts`) → push `/lobby` with **no route params**: lobby reads a module-level room singleton exposed via `useSyncExternalStore` (`useRoom()`).
4. **Join** (`src/app/join.tsx`) — 5-char code, `roomExists(code)` validates → push `/username` with `{ code }` (the only route param in the app).
5. **Username** (`src/app/username.tsx`) — `joinRoom(code, name)` → `replace('/lobby')`.
6. **Movies** (`src/app/movies.tsx`) — dual-purpose editor pushed from create (pre-room, cap = Infinity) or lobby (cap = `room.config.perPlayer`); commits draft to the movie-selection singleton on back/done, always `router.back()`.
7. **Lobby** (`src/app/lobby.tsx`) — roster, pool, share code. Host HoldButton or lobby-timer expiry → `startGame(movies)` writes game to `rooms/{code}`. `room === null` → `replace('/')`.
8. **Game — no route change.** `room.started` true → lobby renders `<BracketGame>` / `<KothGame>` as absolute full-screen overlay (`lobby.tsx:253`). Four Firestore `onSnapshot` listeners (room doc, players, pool, votes) feed `deriveGame()`; all devices converge on the same matchup. Vote = `castVote` writing `votes/{step}__{uid}`. **The host client is the game engine**: only it runs `openMatch` → `resolveCurrent` (tally at `matchEndsAt`) → `advanceAfterReveal`, gated by `isHostLive()` (`room.ts:571`).
9. **Exit** — `replace('/')` unmounts lobby → cleanup effect calls `leaveRoom()` (deletes own `players/{uid}` + `pool/{uid}` docs, nulls singleton). The room doc itself is never deleted.

Key structural facts:
- Firestore layout: `rooms/{code}` (config, hostId, status, game) with subcollections `players/{uid}`, `pool/{uid}`, `votes/{step}__{uid}`.
- Room identity lives in a singleton, not route params (host path passes nothing to `/lobby`).
- `leaveRoom()` fires on ANY lobby unmount (`lobby.tsx:55` cleanup) — back gesture included.
- All Firestore mutations are fire-and-forget with `.catch(() => {})`.

---

## Cluster 1 — Firestore security rules

**Why a cluster:** one deployed rules file resolves four findings at once. **Release blocker.**
**Cluster status:** DONE — rules deployed to `reelduel-enes` 2026-07-08, verified (unauthenticated REST read returns PERMISSION_DENIED)

Notes from the fix (2026-07-08):
- `firestore.rules` + `firebase.json` created at repo root. Rules originally made `hostId` immutable; cluster 3 (2026-07-08) added the sole exception — the heartbeat-stale takeover branch.
- Side benefit for 2.2: rules split create/update, so a colliding `setDoc` on an existing room is now a denied update instead of a silent clobber (root cause still open in cluster 2).

- [x] **1.1 (CRITICAL) Database is world read/write — no rules exist.**
  Fixed: 2026-07-08 — authored `firestore.rules` (auth required everywhere; per-uid write scoping on players/pool; vote doc id must be `{step}__{auth.uid}`; default deny) + `firebase.json`. Deployed 2026-07-08.
  `FIREBASE_SETUP.md:51` confirms test mode; no `firestore.rules` / `firebase.json` in repo. Firebase web config ships in the bundle (`EXPO_PUBLIC_*`, `src/lib/firebase.ts:6-13`), so anyone can extract it and read every room (nicknames + picks) or overwrite any document.
  **Fix:** author + deploy `firestore.rules`; require `request.auth != null` everywhere; writes to `rooms/{code}/players/{uid}` and `pool/{uid}` only when `request.auth.uid == uid`; votes `{step}__{uid}` only when the uid suffix matches `request.auth.uid`. Commit `firestore.rules` + `firebase.json` to the repo.

- [x] **1.2 (CRITICAL) Host authority is client-side only.**
  Fixed: 2026-07-08 — rules restrict room-doc update/delete (game/status/results/step live on the room doc) to `request.auth.uid == resource.data.hostId`; `hostId`/`code` immutable. Deployed 2026-07-08.
  `src/state/room.ts:571-579` — `startGame` / `openMatch` / `resolveCurrent` / `advanceAfterReveal` gate on local `roomDoc.hostId === myUid`. The writes carry no server-side authorization: any participant can override winners, jump `game.step`, end the game.
  **Fix:** rules restricting `game` / `status` / results writes on `rooms/{code}` to `request.auth.uid == resource.data.hostId`. `isHostLive()` stays as UI gating only.

- [x] **1.3 (LOW) Nickname limits are client-only.**
  Fixed: 2026-07-08 — rules validate player `name` (string, 1..24) and room `name` (1..40); client `normalizeName()` added in `room.ts` (strips control/zero-width/bidi chars, collapses whitespace, caps length) and applied in `createRoom`, `joinRoom`, `setMyName`. Deployed 2026-07-08.
  `username.tsx:98` `maxLength=20` + trim in `room.ts:379/523` — nothing server-side. Scripted client can write zalgo / RTL / spoofed / huge names rendered on every roster.
  **Fix:** rules validate name (`string`, size 1..24); also normalize in `joinRoom`/`setMyName` (strip control chars, collapse whitespace).

- [x] **1.4 (MEDIUM) `joinRoom` writes player doc before/without validating room.**
  Fixed: 2026-07-08 — `joinRoom` now does `getDoc` first and throws `Error("room-unavailable")` if the room is missing or `status !== 'lobby'`, before touching module state or writing the player doc; rules additionally gate player-doc create on parent room existing with status `'lobby'`. Deployed 2026-07-08. (Callers don't yet surface the thrown error — that's 4.2.)
  `src/state/room.ts:363-389` — `setDoc` on `players/{uid}` at :376 happens before the `getDoc` at :382; no existence/status check. Clients can create orphan subcollections under arbitrary codes and join started rooms.
  **Fix:** `getDoc` first, throw if missing or `status !== 'lobby'`; enforce same in rules (player-doc create only when parent room exists and status == 'lobby'). Overlaps with 5.3.

---

## Cluster 2 — Room code generation

**Why a cluster:** one function (`makeCode`/`reserveCode`) causes predictability AND silent room clobbering (data loss). Three finders independently confirmed it.
**Cluster status:** DONE

- [x] **2.1 (HIGH) Codes are deterministic — LCG seeded `codeSeed = 7`, resets every launch.**
  Fixed: 2026-07-08 — `makeCode()` now uses `crypto.getRandomValues` (Expo WinterCG global) with a `Math.random` fallback; LCG and `codeSeed` deleted.
  `src/state/room.ts:126-135` — Park-Miller LCG, module-level seed constant. First code after any cold start is identical on every install; whole sequence predictable from source. Guessable (join/grief any room; `roomExists` at :295 is an oracle).
  **Fix:** seed from crypto (`expo-crypto` / `crypto.getRandomValues`), not a constant.

- [x] **2.2 (HIGH) `reserveCode` is non-transactional check-then-set — collisions silently overwrite live rooms.**
  Fixed: 2026-07-08 — `reserveCode` deleted; `createRoom` now claims the code inside `runTransaction` (get → exists? retry new code (8 attempts, then throws `code-unavailable`) : atomically set room doc + host player doc). Rules' `roomIsLobby` switched to `existsAfter`/`getAfter` so the same-transaction player doc validates; rules redeployed 2026-07-08. Rules also deny non-host updates to an existing room, so clobbering is blocked server-side too.
  `room.ts:286-293` loops `getDoc()`, then `createRoom` does plain `setDoc` (:349). Two cold-started devices pick the same code, both see it free, second `setDoc` clobbers the first host's room — its players now point at a different game.
  **Fix:** `runTransaction` (or create-only precondition) so a losing writer detects the collision and retries a new code.

---

## Cluster 3 — Host failover / game liveness

**Why a cluster:** the host client is the sole game engine; anything that stops it strands every player.
**Cluster status:** DONE

Notes from the fix (2026-07-08):
- Room doc gained `hostBeatAt` (serverTimestamp). Host client refreshes it every 5s (`beat()`/`syncHostTimers()` in room.ts, driven from `rebuildLive`, cleared in `detachLive`).
- Non-host clients run a watchdog every 5s: when `hostBeatAt` is stale (20s + rank*5s, rank = position among non-host players by `joinedAt`), the earliest eligible player self-promotes via `runTransaction` (`maybeTakeover()`). Rules takeover branch: claimer must have a player doc in the room, staleness proven against `request.time` (15s, server clock — client's 20s threshold means skew can't false-fire), and MapDiff restricts the write to exactly `hostId` + `hostBeatAt`.
- The new host's `isHostLive()` flips true → driver effect re-runs → `openMatch()` re-opens the stalled step with a fresh vote window; game resumes automatically on every device.
- `hostId` is no longer strictly immutable in rules — mutable ONLY via the takeover branch above. `StoredGame` gained optional `revealEndsAt`.
- Rooms created before this change lack `hostBeatAt` — takeover is impossible for them (watchdog skips, rules deny); they behave as before.

- [x] **3.1 (HIGH) Host disconnect/force-quit/background permanently stalls the game.**
  Fixed: 2026-07-08 — heartbeat + staggered transactional host election, rules-enforced; see cluster notes above. Rules redeployed.
  `room.ts:571-579,606,615,647` + `bracket-game.tsx:52-69` (identical in `koth-game.tsx`) — only the host's effect schedules `resolveCurrent`/`advanceAfterReveal`. No heartbeat, timeout takeover, or re-election. Countdown expires on every device; nothing writes `game.results[step]`; frozen forever.
  **Fix:** host heartbeat timestamp on the room doc + deterministic re-election (earliest `joinedAt`) when stale; or allow any client to resolve a step whose `matchEndsAt` is > N s past. At minimum surface a "host left" state.

- [x] **3.2 (MEDIUM) Reveal→advance timer restarts from scratch on every snapshot.**
  Fixed: 2026-07-08 — `resolveCurrent` now writes `game.revealEndsAt = Date.now() + REVEAL_MS` atomically with the result; the driver effect schedules `advanceAfterReveal` at `max(0, revealEndsAt - Date.now())` instead of a relative delay, so snapshot churn no longer restarts the countdown. `REVEAL_MS` moved to room.ts (exported); both game components import it.
  `bracket-game.tsx:52-57,69` / `koth-game.tsx:53-55,67` — effect deps on the whole `game` object, which `deriveGame` rebuilds on EVERY snapshot of any of 4 listeners; when `results[step]` is set, each snapshot clears + recreates `setTimeout(advanceAfterReveal, REVEAL_MS)`, resetting the full delay. Churn during reveal delays or indefinitely postpones advancement.
  **Fix:** store absolute `revealEndsAt` in the game doc when the result is written; schedule at `max(0, revealEndsAt - Date.now())`. Or hold the deadline in a ref.

- [x] **3.3 (LOW) Host resolve-effect deps on whole `game` object — teardown per vote.**
  Fixed: 2026-07-08 — driver effect in bracket-game.tsx and koth-game.tsx now depends on primitives (`isHost, started, gamePhase, sharedStep, sharedResolved, matchEndsAt, revealEndsAt`); incoming vote snapshots no longer tear down/recreate the timers.
  `bracket-game.tsx:69` / `koth-game.tsx:67` — effect re-runs on every incoming vote snapshot, recreating its timer. Not a correctness bug (matchEndsAt stable, cleanup correct), but wasteful and fragile.
  **Fix:** depend on stable primitives: `[isHost, started, game?.phase, game?.step, game?.matchEndsAt, ...]`. Related to 3.2 — fix together.

---

## Cluster 4 — Error surfacing & write reliability

**Why a cluster:** one shared error-state pattern (inline banner + awaited critical writes) fixes all four.
**Cluster status:** DONE

- [x] **4.1 (HIGH) Room-creation failure is a silent dead end.**
  Fixed: 2026-07-08 — `onCreate` catches, fires error haptic, shows a red error pill (`errorPill` style) above the footer button; cleared on retry. Navigation only on success.
  `create.tsx:197-215` — `onCreate` awaits `createRoom()` in try/finally, no catch, no error UI. Failure (offline, auth swallowed at `_layout.tsx:32`) → button resets to "Create Room", user stranded, unhandled rejection.
  **Fix:** try/catch + error state + inline banner (reuse warning-pill style at `create.tsx:621`); navigate only on success.

- [x] **4.2 (HIGH) Join failure is the same silent dead end.**
  Fixed: 2026-07-08 — `onContinue` catches; `room-unavailable` (thrown by joinRoom since 1.4) gets a specific "no longer accepting players" message, anything else a network-retry message; same error pill UI as create.
  `username.tsx:38-48` — identical pattern around `joinRoom()`.
  **Fix:** same as 4.1.

- [x] **4.3 (MEDIUM) Every Firestore write swallows errors with `.catch(() => {})`.**
  Fixed: 2026-07-08 — critical game writes (`startGame`, `castVote`, `openMatch`, `resolveCurrent`, `advanceAfterReveal`) now retry via `scheduleRetry` (3 attempts, linear backoff, `console.warn` on exhaustion). Each function splits into a public wrapper + `*Attempt(step, attempt)` that captures `step` at first call and re-checks `g.step !== step` / result / `isHostLive()` guards, so stale retries after the game advances or host changes are no-ops. Low-stakes writes (`syncMyMovies`, `setMyName`, `leaveRoom`) intentionally stay fire-and-forget.
  `room.ts` — createRoom, joinRoom (:376), syncMyMovies (:395/397), setMyName (:523), startGame (:585), castVote (:599), openMatch (:610), resolveCurrent (:642), advanceAfterReveal (:663-682), leaveRoom (:691-692). A failed resolve/advance write is never retried (host effect only re-fires on a new snapshot) → game hangs silently.
  **Fix:** await critical writes (start/resolve/advance) with retry independent of incoming snapshots; expose an error/retry state on RoomState.

- [x] **4.4 (MEDIUM) `createRoom` commits local live state before Firestore writes succeed.**
  Fixed: 2026-07-08 — state-ordering fixed in cluster 2 (`createRoom` mutates nothing until the transaction succeeds); error surfacing landed with 4.1.
  `room.ts:344-357` — flips `kind='live'`, sets docs, calls `rebuildLive()` BEFORE awaiting the two `setDoc`s. On rejection the singleton believes it's in a live room while nothing exists server-side.
  **Fix:** await (batched) writes first, then commit local state; reset `kind`/`liveCode`/`myUid` on failure.

---

## Cluster 5 — Game correctness (start / votes / joins)

**Why a cluster:** all live in `startGame` / `resolveCurrent` / `joinRoom`; small, related edits.
**Cluster status:** OPEN

- [ ] **5.1 (HIGH) Duplicate movies (same TMDB id) never deduped — a movie can face itself.**
  `lobby.tsx:71` — `const movies = [...pool, ...mine]`; dedup exists only within one device's own selection (`movie-selection.ts:29`). Two players adding the same popular movie is common; `buildBracket`/`buildKoth` (`game.ts:58-73`) seed it twice.
  **Fix:** in `startGame`/`buildGame`: `const unique = [...new Map(movies.map(m => [m.id, m])).values()]`. Consider deduping in `rebuildLive` pool merge so the lobby grid shows real distinct count.

- [ ] **5.2 (LOW) `startGame` double-invocation builds two different games.**
  `lobby.tsx:104-109` — HoldButton `onStart` + LobbyTimer `onExpire` can both fire before the snapshot round-trips; guard `roomDoc?.game` (`room.ts:583`) reads the stale local cache. `buildGame()` uses `Math.random()`, so the second write is a DIFFERENT bracket → torn state across devices.
  **Fix:** synchronous in-flight flag before `updateDoc` + transaction that only sets `game` if server doc still has `game == null`; disable HoldButton after `onExpire`.

- [x] **5.3 (MEDIUM) Join-after-start TOCTOU.**
  Fixed: 2026-07-08 — `joinRoom` re-checks status and throws (1.4); rules enforce lobby-only player creates; username screen now catches and shows the "no longer accepting players" message (4.2).
  `room.ts:363` — `roomExists` (used at join-screen time) rejects started rooms, but `joinRoom` re-checks nothing; host can start while the player types a name. Late joiner lands in an in-progress game, isn't in the bracket (seeds frozen at startGame), yet `castVote` accepts their votes.
  **Fix:** in `joinRoom`, `getDoc` first, throw if `status !== 'lobby'`; surface on username screen (pairs with 4.2). Enforce in rules (pairs with 1.4).

- [ ] **5.4 (MEDIUM) Last-moment votes silently dropped.**
  `room.ts:628,637` — host resolves at `matchEndsAt` from `currentCounts(g)`, which reads the host's last-received votes snapshot, not a fresh read. A vote written in the final ~hundreds of ms persists in Firestore but is never counted.
  **Fix:** resolve at `matchEndsAt + ~750ms` grace and/or fresh `getDocs` of votes inside `resolveCurrent`; show a "locking votes" state so late taps are visibly rejected.

---

## Cluster 6 — Accessibility

**Why a cluster:** one sweep adding roles/labels/states; `src/` currently has ZERO accessibility props (grep-confirmed).
**Cluster status:** OPEN

- [ ] **6.1 (HIGH) Icon-only buttons have no accessibility labels.**
  Back chevrons (`create.tsx:418`, `join.tsx:329`, `username.tsx:61`, `movies.tsx:227`, `lobby.tsx:206`, `bracket-game.tsx:230`, `koth-game.tsx:233`), share-code pill (`lobby.tsx:137`), remove-movie × (`movie-pool.tsx:84`, `create.tsx:344`), Add tile. `SpringButton` never sets `accessibilityRole`.
  **Fix:** add `accessibilityRole="button"` + descriptive `accessibilityLabel` per control; add role/label passthrough props to `src/components/ui/spring-button.tsx` so callers set them once.

- [ ] **6.2 (HIGH) Vote posters — the core interaction — are invisible to screen readers.**
  `duel-vote.tsx:107` — image-only Pressable, no label/role/state; "YOUR PICK" and win/loss are purely visual.
  **Fix:** `accessibilityRole="button"`, `accessibilityLabel={`Vote for ${movie.title}`}`, `accessibilityState={{ selected: picked, disabled: revealed }}`; announce countdown/result via `AccessibilityInfo.announceForAccessibility` or live region.

- [ ] **6.3 (MEDIUM) Toggle not announced as a switch.**
  `toggle.tsx:51` — bare Pressable, no `role="switch"` / `state={{checked}}`; `create.tsx:284-286` wraps it in `pointerEvents="none"` so it isn't even an independent element.
  **Fix:** role/state/label on the outer row Pressable in create.tsx; add props to Toggle itself.

- [ ] **6.4 (LOW) Disabled primary buttons are dimmed Views with no reason.**
  `create.tsx:451` (same pattern in `username.tsx`, `join.tsx`) — swapped for opacity-0.4 View; not focusable, no `accessibilityState={{disabled}}`, no hint why (empty room name etc.).
  **Fix:** keep as Pressable with `disabled` + a11y state; add helper text ("Enter a room name to continue").

---

## Standalone issues (no cluster)

**Section status:** OPEN

- [ ] **S.1 (MEDIUM) TMDB v3 API key ships in the client bundle.**
  `src/lib/tmdb.ts:3,29` — `EXPO_PUBLIC_TMDB_API` interpolated into the URL; extractable from any shipped bundle; abuse burns quota / gets key revoked for all users.
  **Fix:** proxy TMDB through a server endpoint (Expo Router API route / Cloud Function) holding the key; or knowingly accept the risk and monitor/rotate.

- [ ] **S.2 (MEDIUM) Rooms, games, and votes are never deleted — unbounded Firestore growth.**
  `room.ts:688-700` — `leaveRoom` deletes only the caller's player+pool docs. Room doc + entire votes subcollection persist forever; departed-host rooms stay joinable but undriveable.
  **Fix:** host-leave path recursively deletes the room (batched client delete or Cloud Function); delete a step's vote docs after resolution. Distinguish host-abandon from player-leave.

- [ ] **S.3 (MEDIUM) Back gesture from lobby silently destroys membership / abandons room.**
  `lobby.tsx:55` — `useEffect(() => () => leaveRoom(), [])` fires on ANY unmount (chevron, hardware back, edge swipe). Host's just-created room abandoned with zero warning.
  **Fix:** confirm before leaving (especially host: "leaving ends the room"); separate intentional leave from incidental unmount.

- [ ] **S.4 (MEDIUM) `join.tsx` fires setState/haptics after unmount.**
  `join.tsx:200` — `validate()` awaits `roomExists`, then schedules its setTimeout chain; unmount during the await means the cleanup (which clears `timers.current`) is a no-op — timers don't exist yet. `onBack` (:270) doesn't clear either.
  **Fix:** isMounted ref / AbortController; bail after the await if unmounted; clear timers in `onBack`.

- [ ] **S.5 (LOW) `deriveGame` re-tallies ALL votes + recomputes `bracketPlaylist` on every snapshot.**
  `room.ts:224-234,246` — pure `bracketPlaylist(bracketSize, roundCount)` recomputed per snapshot; full `voteDocs` (never pruned — see S.2) iterated each time. O(all-votes) per snapshot, grows for the room's lifetime.
  **Fix:** compute playlist once at game build (store on StoredGame or memoize); filter votes to the current step once; prune resolved-step votes.

- [ ] **S.6 (LOW) Legacy RN `Image` in LavaBackdrop.**
  `lava-backdrop.tsx:190` — sole deviation from the expo-image convention. Partly justified: needs `resizeMode="repeat"` for the grain tile, which expo-image lacks.
  **Fix:** leave but mark the exception deliberate, or pre-tile grain into a full-screen asset and use expo-image. No functional change required.

---

## Refuted claims (do NOT re-report these)

Adversarial verification rejected these — listed so future audits don't resurrect them:

1. **"Vote tally can be stuffed with unlimited forged ballots"** — vote docs are keyed `{step}__{uid}`, so a client re-voting overwrites its own doc. (Forging OTHER uids is still possible under open rules — that's covered by cluster 1, not a separate issue.)
2. **"joinRoom TOCTOU"** duplicate phrasing — merged into 5.3/1.4.
3. **"DuelVote clips on small screens / ignores safe areas"** — layout verified fine.
4. **"Low-opacity text fails WCAG AA contrast"** — not confirmed against actual rendered values.
5. **"`experimental_backgroundImage` radial gradients unverified on SDK 57"** — works.
6. **"Clock skew breaks countdown timers"** — timers anchor to host-written absolute epochs; skew shifts display slightly but host resolves authoritatively; not a practical defect.

---

## Suggested fix order

1. Cluster 1 (rules) — release blocker, kills 4 issues with one file.
2. Cluster 2 (codes) — silent data loss.
3. Cluster 3 (host failover) — one sleeping phone bricks the party.
4. Cluster 4 (error surfacing) — shared pattern, quick wins.
5. Cluster 5 (game correctness) — dedup, double-start, late votes.
6. Cluster 6 (accessibility) + standalone items.
