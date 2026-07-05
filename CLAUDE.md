# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What ReelDuel is

A social movie-picking party app. A group can't decide what to watch, so one person hosts and the rest join — Kahoot-style, no accounts required to play. Movies then face off head-to-head and everyone votes until one winner remains: that's what the group watches.

**Core flow:**

1. **Home** — create a room, or join with a short room code.
2. **Lobby** — host configures the movie pool (TMDB search / category, or players add movies); joined players are listed; host starts.
3. **Voting** — movies presented as duels/matchups, one pair at a time; each player votes on their own device (swipe/tap cards); votes tally across all players in the room in real time.
4. **Results** — winning movie revealed to everyone with the vote breakdown.

**Game modes:** _Bracket_ (classic tournament, winners advance) and _King of the Hill_ (winner stays, next challenger steps up).

**Domain model (planned, not yet built).** State lives in Firestore, synced live between devices; players authenticate anonymously (Firebase Anonymous Auth) — there are no user accounts. The key entities are a **room** (identified by a short join code, holds mode + status + the movie pool), **players** in that room (nickname, no login), **matchups/duels** (the current pair being voted on), and **votes** (per player, per matchup). Movie data (posters, titles, ratings, genres) comes from **TMDB**. Real-time listeners on the room drive every player's screen — design writes so all devices converge on the same matchup and tally.

## Non-negotiable: Expo 57 is new

This project runs Expo SDK 57 / React Native 0.86 / React 19.2, a stack newer than most training data. APIs (expo-router, expo-glass-effect, @expo/ui, reanimated 4) have changed. Read the versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing code against any Expo/RN API — do not rely on remembered signatures from older SDKs.

## Commands

```bash
npm start          # Expo dev server (QR code, dev client)
npm run ios        # open in iOS simulator
npm run android    # open in Android emulator
npm run web        # run in browser (react-native-web)
npm run lint       # expo lint (eslint-config-expo); scaffolds ESLint config on first run
```

There is no test runner configured yet. `expo lint` and the TypeScript compiler (`npx tsc --noEmit`) are the only static checks. `npm run reset-project` points at a script that was moved into `example/` and no longer exists at that path — do not rely on it.

## Architecture

**This is a near-empty scaffold.** Only `src/app/_layout.tsx` (a bare `<Stack />`) and `src/app/index.tsx` (a placeholder title screen) exist. The features described in the README — rooms, join codes, brackets, voting, real-time sync — are **not built yet**. Firebase and TMDB are named in the README and app concept but are **not installed** (`package.json` has no firebase / TMDB deps). Wiring those in is expected work, not existing infrastructure.

**Routing.** File-based via `expo-router`, and routes live in `src/app/` (not a root-level `app/`). `expo-router/entry` is the app main. `typedRoutes` is enabled, so route strings are type-checked and generated into `.expo/types` — after adding/renaming a route file, the dev server must run for a moment to regenerate those types.

**Path aliases** (`tsconfig.json`): `@/*` → `src/*`, `@/assets/*` → `assets/*`. Prefer these over deep relative paths.

**React Compiler is on** (`app.json` → `experiments.reactCompiler`). With React 19 + the compiler, manual memoization (`useMemo`/`useCallback`/`React.memo`) is generally unnecessary and discouraged — write plain components and let the compiler handle it.

**The `example/` directory is a gitignored reference copy of the original Expo template** (themed-text/themed-view, `use-color-scheme` hooks, `constants/theme.ts`, blur/glass tab bar, collapsible, etc.). It is not part of the app and is not imported, but it is the canonical source of working RN patterns for this SDK — consult it when you need a known-good example (theming, platform `.web.tsx` splits, reanimated usage) rather than inventing from scratch.

## Conventions

- TypeScript everywhere, `strict` on. `.tsx` for components, functional components with hooks only — no class components.
- Use Reanimated 4 worklets (`react-native-worklets`, `react-native-gesture-handler`) for anything gesture- or animation-driven. Do not use the legacy RN `Animated` API.
- Design direction: dark theme by default, glassy/blurred surfaces (`expo-blur`, `expo-glass-effect`, `@expo/ui`), spring-based motion. The UI language and design system are intentionally undecided — treat visual/system decisions as open and confirm direction rather than assuming.
- Prefer `expo-image` over RN `Image`, `expo-symbols` for iconography, `expo-haptics` for tactile feedback on votes/actions.
- The developer is experienced with React/Next.js but new to React Native — when using a non-obvious RN pattern, add a short note on why.
