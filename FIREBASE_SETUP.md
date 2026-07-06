# ReelDuel — Firebase Setup

This is the **real, permanent** Firebase project for ReelDuel — the same one used through
development and into the App Store. Nothing here gets thrown away. The only thing that changes
between now and launch is the **Firestore security rules** (open now for fast iteration, locked
down before release).

## Part A — Create project (Firebase Console)

Go to **https://console.firebase.google.com**

1. **Add project** → name it `ReelDuel` (this is the production name — shows in console + billing).
2. **Google Analytics** → toggle **OFF** for now. It can be enabled later without recreating the
   project, so leave it off to keep setup simple.
3. Create project → wait ~30s → Continue.

## Part B — Register a Web app

3. On project home, click the **`</>`** (Web) icon.
4. App nickname: `reelduel` → **do NOT** check "Firebase Hosting" → **Register app**.
5. Firebase shows a `firebaseConfig = { ... }` block. **This is what I need.** Copy the whole object. Looks like:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "reelduel-xxxx.firebaseapp.com",
     projectId: "reelduel-xxxx",
     storageBucket: "reelduel-xxxx.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234:web:abcd1234"
   };
   ```
6. Click **Continue to console** (skip the SDK install steps — I do that).

## Part C — Enable Anonymous Auth

*(Left sidebar → **Build** → **Authentication**)*

7. **Get started**.
8. **Sign-in method** tab → find **Anonymous** in the list → click it → toggle **Enable** → **Save**.

> Miss this = every join throws `auth/admin-restricted-operation`. Don't skip.

## Part D — Create Firestore

*(Left sidebar → **Build** → **Firestore Database**)*

9. **Create database**.
10. **Location — this is permanent and cannot be changed.** Since this is the production database,
    pick the region closest to where most players will be (e.g. `eur3` for Europe, `us-central` for
    US). Choose deliberately, not by default.
11. Start in **Test mode** → **Create**.

> Test mode = anyone can read/write, and it auto-expires ~30 days out. That's intentional for fast
> development. Before the App Store build, I replace this with proper security rules (only room
> members can write, only the host can advance the game) — no project recreation needed, just a
> rules change.

## Part E — TMDB key

`src/lib/tmdb.ts` reads `EXPO_PUBLIC_TMDB_API` for real movie search (posters, titles, years).
Get it once, use it for good: **https://www.themoviedb.org/settings/api** → copy the
**API Key (v3 auth)**. If not provided, movie search falls back to the built-in mock list.

---

## What to paste back

**Required:**

```
Firebase config:
apiKey: ...
authDomain: ...
projectId: ...
storageBucket: ...
messagingSenderId: ...
appId: ...
```

(or just paste the whole `firebaseConfig = {...}` block — it will be parsed)

**Optional:**

```
TMDB key: ...
```

---

## After config is provided, the build steps:

1. `npx expo install firebase`
2. Add `src/lib/firebase.ts` (init app + auth + firestore) + write config to `.env`
3. Anonymous sign-in on boot
4. Rewrite `src/state/room.ts` → real Firestore create/join/lobby (delete the fake bots)
5. Run `npm run ios` on two devices/sims → create on one, join by code on other → players sync live

Then iterate on voting.

## Path to App Store (what changes later, same project)

- **Firestore rules** — swap test mode for locked-down rules. The one required step before release.
- **Analytics** — optionally enable in console.
- **Billing** — stays on free Spark plan unless server-side Cloud Functions are added. Vote tally can
  run client-side (host device), so free plan is enough even in production for this app's scale.

## Cost / safety notes

- Config strings above are **public by design** — safe to paste, safe in client code. Real security
  = Firestore rules.
- **Spark (free) plan, no card.** A party app of this scale won't touch free limits. No charge unless
  the project is manually upgraded to Blaze.

## Sources

- [Expo — Using Firebase](https://docs.expo.dev/guides/using-firebase/)
- [Firebase — Anonymous Auth (Web)](https://firebase.google.com/docs/auth/web/anonymous-auth)
- [Firebase — Add Firebase to JS project](https://firebase.google.com/docs/web/setup)
- [Firebase — Firestore quickstart](https://firebase.google.com/docs/firestore/quickstart)
