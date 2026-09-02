# `@huntstack/mobile`

The HuntStack native app — React Native + Expo SDK 57, expo-router, TypeScript. It talks to the
existing Fastify API (`apps/api`) over HTTP and shares no code with `apps/web`.

v1 ships one screen that earns its place on a phone — **Where to Hunt**, Killer Feature #1 — plus a
Settings/About tab and a recommendation detail view. It runs in **Expo Go**; there is no App Store or
Play Store build, no `eas.json`, and no auth.

See `CURRENT_STATE.md §17` for what is built and `CONSTRAINTS.md §8` for the rules that apply when
changing it.

---

## Running it

All commands are run **from the repo root** (`huntstack/`), not from this directory.

```bash
pnpm install                              # once, from the root
pnpm --filter @huntstack/api dev          # terminal 1 — the API
pnpm --filter @huntstack/mobile start     # terminal 2 — Metro
```

Then open the Expo Go app on your phone and scan the QR code Metro prints.

### Your phone must be on the same wifi as your laptop

This is not optional and it is the most common reason the app starts but shows no data. Expo Go loads
the JS bundle from Metro over the LAN, and the app then derives the **API** host from that same Metro
address (see below). A phone on cellular data, on a guest network, or on a network with client
isolation enabled can reach neither.

Simulators and emulators work too (`pnpm --filter @huntstack/mobile ios` / `... android`) and are
subject to the same rule, since they are not on the host's loopback interface either.

---

## Pointing it at an API

**In development, do nothing.** When `EXPO_PUBLIC_API_URL` is unset, the app reads the Metro
dev-server host from `expo-constants` (`Constants.expoConfig.hostUri`, e.g. `192.168.1.34:8081`),
drops Metro's port, and requests `http://192.168.1.34:4000`. `apps/api` binds `HOST` `0.0.0.0` by
default, so that LAN address is already served.

**Why not `localhost`:** on a phone or an emulator, `localhost` resolves to *the device itself*, not
to the laptop running the API. There is deliberately no localhost fallback.

**To point it somewhere else,** create `apps/mobile/.env` (git-ignored; `.env.example` documents it):

```
EXPO_PUBLIC_API_URL=http://192.168.1.34:4000
```

Restart Metro after changing it — `EXPO_PUBLIC_*` values are inlined into the bundle at build time,
not read at runtime.

### Two traps worth knowing before you debug anything

**1. The API port is 4000, but `CLAUDE.md:291` says 4001.** `apps/api` defaults `PORT` to 4000 and
this app derives `:4000`, so the default case works. That line in `CLAUDE.md` is stale. But if your
`.env` sets `PORT=4001`, or you run the API on any non-default port, **you must set
`EXPO_PUBLIC_API_URL` explicitly** — otherwise the app builds a perfectly well-formed URL pointing at
a closed port and gives you no hint why nothing loads.

**2. `EXPO_PUBLIC_API_URL` must include the scheme.** `api.example.com` is rejected with a
configuration error; `http://api.example.com` is accepted. Without the check, a scheme-less value
would fail later as an opaque network error instead of a clear one.

**When in doubt, open the Settings tab.** It shows the resolved API base URL *and* whether it came
from `EXPO_PUBLIC_API_URL` or was derived from the Metro host. Paste that URL plus
`/api/hunt/recommendations` into a browser on your laptop — that one step separates "the screen is
broken" from "the API returned nothing".

---

## Checks

```bash
pnpm --filter @huntstack/mobile exec tsc --noEmit          # types
pnpm --filter @huntstack/mobile lint                       # eslint
pnpm --filter @huntstack/mobile test                       # vitest, pure logic only
pnpm --filter @huntstack/mobile exec expo export --platform ios   # Metro bundle
```

All four run in CI on every PR to `main`. The `expo export` one matters most: it runs Metro over the
real dependency graph and is the standing check that pnpm's isolated store still resolves for React
Native — see `CONSTRAINTS.md §8.5`. It needs no simulator, Xcode or device.

Tests are **pure logic only** (`src/lib/*.test.ts`) under a node environment — no component rendering,
matching the precedent `apps/api` sets. Anything that imports `expo-*` is kept out of the tested
modules on purpose, which is why transport, types and decoration live apart from `src/lib/api.ts`.

---

## Layout

```
apps/mobile/
├── src/
│   ├── app/                  # expo-router routes — NOTE: src/app/, not app/
│   │   ├── (tabs)/           # index = Where to Hunt, settings = Settings/About
│   │   └── recommendation/   # [id] = detail view with the score breakdown
│   ├── components/           # RecommendationCard, SpeciesChips, LocationBar, ListMessage
│   ├── hooks/                # useHunterLocation — the only expo-location consumer
│   ├── lib/                  # api, http, types, pure logic + their tests
│   └── theme.ts              # palettes, 4pt spacing scale, TOUCH_TARGET = 44
├── app.json                  # expo config — bundle id com.huntstack.app (permanent)
├── eslint.config.js
└── .env.example
```

SDK 57's template puts the router root under `src/app/`; `tsconfig` maps `@/*` → `./src/*`. There is
no `babel.config.js` and no `metro.config.js`, and neither should be added without a reason —
`CONSTRAINTS.md §8.5` explains why.
