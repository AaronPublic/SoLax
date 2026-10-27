# SoLax: Solar Roof Planner

See how many solar panels fit on your roof, and what they'd produce, without leaving the browser.
Find your house on a satellite map of the Philippines, click its roof (or trace it yourself), and
the app lays out 550 W panels on the real roof outline, sizes a system for your electric bill and
estimates production month by month.

## Features

- **Pick your roof on a satellite map.** Building outlines from OpenStreetMap light up as you hover.
- **Draw or adjust the outline.** Trace a roof that isn't mapped, or drag the corners of one that's off.
- **Real panel layout.** Panels (2 m × 1 m, 550 W) are fitted in PostGIS to the roof's shape and
  direction, with a 0.5 m clear edge, in true metres (local UTM zone).
- **Local sun data.** Monthly production from NREL PVWatts v8 for the roof's exact location.
- **Sized to your bill.** Enter your monthly kWh; the app recommends just enough panels and shows
  what the whole roof could produce. Change the kWh and everything updates instantly.
- **Accounts and saved plans.** Register, save plans, reopen them on the map later (Supabase Auth).

## Tech stack

| Layer | Technology |
|---|---|
| App | Next.js 16 (App Router, TypeScript), React 19 |
| Database | Supabase PostgreSQL + PostGIS, via Prisma 7 (`@prisma/adapter-pg`) |
| Auth | Supabase Auth (`@supabase/ssr`) |
| Map | Google Maps JavaScript API (satellite view) |
| Building outlines | OpenStreetMap via [OpenFreeMap](https://openfreemap.org) vector tiles, with the Overpass API as fallback; cached in the database |
| Solar estimates | NREL PVWatts v8 |

## Getting started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier is fine)
- A Google Cloud project with the **Maps JavaScript API** enabled and **billing linked** (Google
  requires billing even within the free monthly allowance)
- An NREL API key: free at <https://developer.nlr.gov/signup/> (NREL's APIs moved from
  `developer.nrel.gov` to `developer.nlr.gov`)

### Setup

```bash
git clone https://github.com/AaronPublic/SoLax.git
cd SoLax
npm install            # also runs `prisma generate`
cp .env.example .env   # then fill in the values (see below)
npm run db:migrate     # enables PostGIS, creates the tables, turns on row-level security
npm run dev            # http://localhost:3000
```

If npm reports blocked install scripts, run `npm approve-scripts --allow-scripts-pending`, then
`npx prisma generate`.

### Environment variables

All settings live in `.env`, which is git-ignored. **Never commit it.** `.env.example` documents every variable.

| Variable | Where it's used | Notes |
|---|---|---|
| `DATABASE_URL` | Server | Supabase **transaction pooler** URL (port 6543, `?pgbouncer=true`) |
| `DIRECT_URL` | Prisma CLI | Supabase **session/direct** URL (port 5432), used for migrations |
| `NREL_API_KEY` | Server | PVWatts key. `DEMO_KEY` works for quick tests but is heavily rate-limited |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Browser | Public by design. **Restrict it by HTTP referrer** in Google Cloud |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server | Your project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser + server | The *publishable*/*anon* key, **never** the secret/service-role key |
| `NEXT_PUBLIC_MAP_BOUNDS`, `NEXT_PUBLIC_MAP_CENTER` | Browser | Optional; default to the whole Philippines / Manila |
| `OVERPASS_URLS` | Server | Optional comma-separated Overpass servers for the fallback |

If your database password contains special characters (`@ # / ?`), URL-encode them in both URLs.

### Supabase Auth settings

In the Supabase dashboard:

1. **Authentication → URL Configuration**: set *Site URL* to your app's URL (`http://localhost:3000`
   in development) and add `http://localhost:3000/**` (and your production URL) to *Redirect URLs*,
   so confirmation emails return to `/auth/callback`.
2. Supabase's built-in email sender only sends a few emails per hour. For development you can turn off
   **Authentication → Sign In / Providers → Email → Confirm email**; for production, configure your own SMTP.

## How it works

1. **Buildings.** The browser asks `/api/buildings` for outlines in ~550 m tiles. The server serves
   them from the `BuildingTile` cache, or reads OpenFreeMap's z14 vector tiles (falling back to
   Overpass), splits them into individual roofs and caches them.
2. **Panel fitting** (`lib/panel-fit.ts`). One PostGIS query projects the roof to its UTM zone, finds
   its long axis (`ST_OrientedEnvelope`), removes a 0.5 m setback, tries 8 candidate grids (2 panel
   orientations × 4 half-step offsets), keeps panels fully inside the roof (`ST_CoveredBy`) and
   returns them sorted from the centre out.
3. **Production.** PVWatts is called once for a 1 kWp system (15° tilt, facing the equator, 14%
   losses). Output scales linearly, so `lib/sizing.ts` sizes any system from that profile, on the
   server and instantly in the browser.
4. **Saving.** `POST /api/plans` recomputes the plan on the server (it never trusts numbers from the
   browser) and stores it with the roof outline.

## API

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /api/buildings?tiles=<ix>_<iy>,…` | — | Building outlines for map tiles |
| `POST /api/calculate-solar` | — | Fit panels and estimate production for a roof |
| `POST /api/plans` | Required | Save a plan (recomputed server-side) |
| `GET /api/plans/:id` | Owner | Open a saved plan |
| `DELETE /api/plans/:id` | Owner | Delete a saved plan |

`POST /api/calculate-solar` body:

```json
{ "geometry": { "type": "Polygon", "coordinates": [[[121.07, 14.65], "…"]] }, "monthlyKwh": 450 }
```

The response shape is `CalculateSolarResponse` in `lib/types.ts`. Roofs larger than 5,000 m², with
more than 500 vertices, or outside the Philippines are rejected.

## Security

- **Secrets stay server-side.** Only `NEXT_PUBLIC_*` values reach the browser, and those are
  public by design (Google Maps key, Supabase URL and publishable key). The database URLs and the NREL
  key are only read on the server.
- **Row-level security** is enabled on every table with no policies, so Supabase's public REST API
  (reachable with the publishable key) can't read or write app data. The app connects through Prisma
  as the table owner and checks ownership itself: users can only open or delete their own plans.
- **Sessions** are verified on the server from the Supabase JWT (`getClaims`); `proxy.ts` refreshes
  them and protects `/plans`.
- **No open redirects.** Post-login `?next=` targets are restricted to same-origin paths.
- **Rate limiting** per IP on the public API routes (`lib/rate-limit.ts`; in-memory, so per server
  instance).
- **Security headers** (no framing, `nosniff`, HSTS, strict referrer policy) in `next.config.ts`.
- **SQL** is always parameterised (Prisma tagged templates).

Before deploying, restrict your Google Maps key to your domains, set a quota/budget in Google Cloud,
and keep `.env` out of version control.

## Project structure

```
app/
  page.tsx                 landing page
  plan/                    the planner
  plans/                   saved plans (signed in)
  login/, register/        auth pages
  auth/callback, signout   Supabase auth routes
  api/                     buildings, calculate-solar, plans
components/                SolarPlanner, SolarMap, RoofDrawer, ResultsPanel, SavePlan, …
lib/
  calculate.ts             roof → panels → PVWatts pipeline
  panel-fit.ts             the PostGIS fitting query
  sizing.ts                system sizing (shared client/server)
  openfreemap.ts, overpass.ts, tiles.ts   building outlines
  supabase/                auth clients
prisma/                    schema and migrations
proxy.ts                   session refresh + route protection
```

## Limitations

- Estimates only, not a quote: roof pitch, shading, obstructions and structural limits aren't modelled.
- Outlines come from OpenStreetMap and may be missing or inaccurate. Use *Draw my roof* or *Adjust outline*.
- Deleting a user in Supabase doesn't delete their saved plans automatically.

## Credits

Building data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), served by
[OpenFreeMap](https://openfreemap.org). Solar data: [NREL PVWatts](https://pvwatts.nrel.gov/).
Satellite imagery: Google.
