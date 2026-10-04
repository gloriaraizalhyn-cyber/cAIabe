# cAIabe

**AI-assisted jeepney commuting for Angeles City, Pampanga.**

cAIabe connects the two sides of the jeepney ride. Passengers plan trips across real jeepney routes and see live units on the map. Drivers get a fair terminal queue and **Sak.AI**, a co-pilot that reads real passenger demand and tells them when to wait, when to go, and when idling is wasting fuel.

Every passenger who rides instead of driving, and every minute a driver isn't burning diesel at the roadside, cuts fuel use and CO₂. The app estimates both and shows them on screen.

---

## Contents

- [Features](#features)
- [How it fits together](#how-it-fits-together)
- [Repository layout](#repository-layout)
- [Setup](#setup)
- [Running the hackathon demo](#running-the-hackathon-demo)
- [Fuel and carbon model](#fuel-and-carbon-model)
- [Operating notes](#operating-notes)

---

## Features

### Passengers (`/`)
- **Route search**: walk → ride → transfer → ride → walk itineraries along real route polylines, with up to 2 transfers. Ranked by time, fare and distance, with Google traffic included.
- **Fares with legal discounts**: student, PWD and senior citizen fares are discounted 20% (RA 11314, RA 10754, RA 9994).
- **AI explanations**: Gemini writes a one-line reason for the top pick and a "why not this one" line for each alternative. All scoring is done in code; Gemini only writes the sentences.
- **Live jeepneys and ETAs**: see units on your route and whether they have open seats.
- **Waiting at the bay**: tells drivers on that route that someone is waiting. Your location is blurred by 80–150 m on the server before it's stored.
- **Voice search**: speak your trip, including in Kapampangan, through Whisper speech-to-text and Gemini intent parsing.
- **SMS trip planner**: no smartphone or data needed. Text your trip to the TextBee number and get the route back.
- **Trip CO₂**: each route card shows the estimated CO₂ for your seat compared with driving alone.

### Drivers (`/driver/*`)
- **Registration and verification**: license, permit and document photos go to a private storage bucket. An admin reviews each application.
- **Terminal queue**: geofenced, first-in-first-out queue per terminal and route, with a push alert (Firebase Cloud Messaging) when your turn is near.
- **Sak.AI demand engine**:
  - **WAIT or GO?** at the front of the queue
  - **CONTINUE or GARAGE?** mid-shift
  
  Both use real waiting-passenger clusters ahead on the route, plus the demand trend.
- **Roadside-idling detection**: flags a driver who is stopped outside the terminal while demand is low, with the estimated fuel, cost and CO₂ being wasted.
- **Traffic fuel check**: the extra fuel, pesos and CO₂ today's traffic is costing you. For tricycles, it compares alternative routes by fuel use.

### Admins (`/admin/*`)
- Review, approve, reject, edit and delete driver applications.
- **Carbon Impact panel**: today's fleet-wide CO₂ avoided, engine-off queue time, and idling caught.

### Demo stage (`/demo/stage`)
One projector screen with the passenger app, the live map and the driver app side by side. A presenter bar steps through the story, and the map has a carbon-impact overlay.

---

## How it fits together

```
 React + Vite (frontend/)                    Supabase project
 ┌──────────────────────────┐   anon key    ┌───────────────────────────────────────┐
 │ Passenger · Driver ·      │ ───────────▶ │ Postgres + PostGIS (RLS on all tables) │
 │ Admin · Demo stage        │   RPC / REST │  routes, terminals, queue_entries,     │
 │ Google Maps JS            │              │  driver_live_state, passenger_waiting  │
 │ Firebase Messaging        │ ◀─────────── │ Realtime broadcast channels            │
 └────────────┬─────────────┘   broadcast   │  route:{id}:waiting · route:{id}:queue │
              │ functions.invoke            │ Edge Functions (Deno) ── secrets       │
              └───────────────────────────▶ │ pg_cron + pg_net → queue-advance       │
                                            │ Storage: license-photos (private)      │
 whisper-server/ (local, :8000)             └───────────────┬───────────────────────┘
 Python · FastAPI · Whisper                                 │
                                       Google Routes / Distance Matrix · Gemini ·
                                       OpenAI · Firebase (FCM) · TextBee (SMS)
```

- **Decisions are made in code; AI only writes the wording.** Demand scores, recommendations, route ranking and fuel figures are all computed in code you can read and check. Gemini only rephrases results that are already decided.
- **Privacy:** passenger locations are blurred on the server and expire after 2 hours. Passengers only see drivers who are `next_to_go` or `driving` on their route. The impact panel only reads totals.

---

## Repository layout

```
cAIabe/
├── frontend/                     React 18 + Vite app (deployed on Vercel)
│   └── src/
│       ├── user/                 passenger pages, components, utils
│       ├── driver/               driver pages, hooks (demand, fuel, idling), components
│       ├── admin/                admin login + dashboard
│       ├── demo/                 /demo/stage presenter view
│       ├── shared/               Supabase client, MapView, CarbonImpactPanel, hooks
│       └── router/AppRouter.jsx  all routes
├── supabase/
│   ├── config.toml               CLI config (per-function verify_jwt lives here)
│   ├── functions/                21 Edge Functions + _shared/ (fuel model, FCM, TextBee…)
│   └── sql/                      schema, seed data, RPCs, cron — run in order (below)
├── whisper-server/server.py      local speech-to-text for voice search
├── mock-fleet-simulator.js       drives several looping jeepneys per route
├── mock-passenger-simulator.js   places waiting-passenger clusters (live "surge"/"clear")
├── mock-driver-simulator.js      single scripted driver
└── demo-prep.js                  one-shot setup for the demo stage
```

### Edge Functions

| Function | Who calls it | Purpose |
|---|---|---|
| `route-search` | passenger | Plans and ranks itineraries; fare, traffic, CO₂ per rider |
| `nearby-jeepney-eta` | passenger | ETAs of visible units on a route |
| `waiting-start` / `waiting-clear` | passenger | Mark or clear "waiting at the bay" (location blurred) |
| `parse-voice` / `speech-to-text` / `translate-to-voice` | passenger | Voice search and spoken replies |
| `sms-webhook` | TextBee | SMS trip planner (**no JWT**; checked with a shared secret instead) |
| `driver-onboarding` | driver | Saves profile and documents to the private bucket |
| `driver-location-update` | driver | GPS updates, geofence, queue transitions |
| `driver-queue-join` / `driver-queue-respond` | driver | Join the queue; "lining up" or skip |
| `driver-capacity-toggle` | driver | Full or seats available |
| `driver-demand-check` | driver | Sak.AI WAIT/GO, CONTINUE/GARAGE, roadside idling |
| `driver-fuel-check` | driver | Traffic fuel cost; tricycle route comparison |
| `driver-notify-wait` | driver | Notifies waiting riders on the route |
| `queue-advance` | pg_cron | Moves queues forward, timeouts, push alerts |
| `admin-*` (4) | admin | List, verify, update and delete drivers (checks the `admins` table) |

---

## Setup

### Prerequisites
- **Node.js 20+**
- **Supabase CLI** (`npm i -g supabase`) and a Supabase project on **Postgres 17**
- **Google Cloud** API keys:
  - Browser key: Maps JavaScript API, restricted to your domain
  - Server key: Routes API and Distance Matrix API
- **Gemini** API key, a **Firebase** project with Cloud Messaging, and optionally **OpenAI** and **TextBee**
- For voice search: **Python 3.10+** and **ffmpeg**

### 1. Database

In the Supabase SQL Editor, run the files in [`supabase/sql/`](supabase/sql) in this order. Each file's header says what it depends on.

| # | Files |
|---|---|
| 1 | `schema.sql` (needs the `postgis` and `pg_cron` extensions) |
| 2 | `caiabe_seed_routes.sql`, then `fix_balibago_route.sql` |
| 3 | `rpc_functions.sql`, `lookup_functions.sql`, `transfer_functions.sql` |
| 4 | `add_terminal_geofence_queue.sql` |
| 5 | `add_route_visible_drivers_rpc.sql`, then `fix_route_visible_drivers_security.sql` |
| 6 | `add_driver_demand_functions.sql` |
| 7 | `add_landmarks.sql`, then `add_demo_sm_clark_landmark.sql` |
| 8 | `add_sms_log.sql`, `add_sms_sessions.sql`, then `add_demo_control.sql` |
| 9 | `add_vehicle_type.sql`, `add_discount_type.sql`, `add_driver_license_permit_numbers.sql`, `add_driver_document_photos.sql`, `add_driver_rejection_reason.sql` |
| 10 | `add_admins.sql`, `add_admin_driver_delete_policy.sql` |
| 11 | `add_performance_indexes.sql`, `storage_setup.sql`, `add_carbon_impact.sql` |
| 12 | `queue_advance_cron.sql`, **after** step 2 below. First change the project URL and anon key inside it to your own. |

> **New Supabase projects don't give the API roles access to new tables automatically.** If a page loads but its queries come back empty or with permission errors, grant `select` (and anything else the page needs) to `anon` / `authenticated` on the affected tables.
>
> **Moving to a new project?** Use `supabase db dump` (roles, schema, data) from the old project and restore it into the new one. Don't re-run these files: the dump carries over users, data and anything that was changed in the dashboard.

`export_geojson*.sql` are read-only helpers for exporting route shapes.

**Make yourself an admin:** sign up any account, then run
`insert into admins (id) values ('<auth.users id>');`

### 2. Edge Functions

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy
```

> `sms-webhook` must be deployed **without** JWT verification, because TextBee can't send a Supabase token. Either keep `[functions.sms-webhook] verify_jwt = false` in `supabase/config.toml`, or deploy it with `--no-verify-jwt`.

Set the secrets. `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.

```bash
supabase secrets set \
  GOOGLE_MAPS_API_KEY=... \
  GEMINI_API_KEY=... \
  OPENAI_API_KEY=... \
  FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}' \
  TEXTBEE_API_KEY=... TEXTBEE_DEVICE_ID=... TEXTBEE_WEBHOOK_SECRET=...
```

You can also put them in `supabase/.env.local` (gitignored; see `.env.local.example`) and run `supabase secrets set --env-file supabase/.env.local`.

### 3. Supabase dashboard
- **Authentication → Providers → Email**: turn **off** "Confirm email". Driver sign-up expects to log in straight away.
- **Authentication → URL Configuration**: set the Site URL and redirect URLs to your deployed domain.
- **TextBee**: point the webhook to `https://<ref>.supabase.co/functions/v1/sms-webhook`.

### 4. Frontend

```bash
cd frontend
cp .env.local.example .env.local   # fill in Supabase URL + anon key, Google Maps key, Firebase config
npm install
npm run dev                        # http://localhost:5173
```

`npm run build` writes to `frontend/dist/`. The app is deployed on **Vercel** with `frontend/` as the root directory. `vercel.json` sends every route to the SPA. Set the same `VITE_*` variables in the Vercel project settings.

### 5. Voice search server (optional)

```bash
cd whisper-server
python -m venv whisper-env && whisper-env\Scripts\activate   # macOS/Linux: source whisper-env/bin/activate
pip install fastapi uvicorn python-multipart transformers torch
uvicorn server:app --port 8000
```

The voice search page sends recordings to `http://localhost:8000/transcribe`. ffmpeg must be on your `PATH`.

---

## Running the hackathon demo

Create a root `.env` file (gitignored) with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `GOOGLE_MAPS_API_KEY`. Then:

```bash
node --env-file=.env demo-prep.js                    # once: demo drivers, landmark, sanity checks
node --env-file=.env mock-fleet-simulator.js --jeeps=3
node --env-file=.env mock-passenger-simulator.js --route="Florida"   # optional; type surge / clear / list
```

Open **`/demo/stage`**. Use **Space** or **→** to go to the next step and **←** to go back.

The Carbon Impact overlay starts at zero each day (Philippine time). Before presenting:
- Take one passenger trip through to "I'm at the bay".
- Have drivers queued at a terminal.

That way the panel shows real numbers.

---

## Fuel and carbon model

Every figure is an **estimate**, and the UI labels it that way. All of it comes from one module, [`supabase/functions/_shared/fuel.ts`](supabase/functions/_shared/fuel.ts).

| Input | Value | Basis |
|---|---|---|
| Diesel → CO₂ | 2.68 kg/L | IPCC 2006 default emission factor |
| Gasoline → CO₂ | 2.31 kg/L | IPCC 2006 default emission factor |
| Jeepney idle burn | 1.2–1.8 L/hr | Published range for idling jeepney engines |
| Diesel price | ₱85/L | Placeholder; update before relying on it |
| Jeepney mileage | 4 km/L | Assumption for the pitch |
| Average jeepney load | 12 riders | Assumption |
| Comparison car | 10 km/L, gasoline, one occupant | Assumption |

What the **Carbon Impact panel** counts ([`add_carbon_impact.sql`](supabase/sql/add_carbon_impact.sql)):
- **CO₂ avoided** = riders' savings compared with driving alone, **plus** engine-off queue time at terminals. The queue part assumes engines are switched off while queued.
- **Idling caught** = roadside idle burn that Sak.AI flagged. This fuel was already wasted, so it is reported separately and **never** added to "avoided".

Quick conversion for the pitch: at ₱85/L, **₱100 of diesel saved ≈ 1.2 L ≈ 3.2 kg CO₂ not emitted.**

---

## Operating notes

- **Free-tier egress.** `queue-advance` runs every minute but only makes its HTTP call while someone is actually queued. The simulators generate a lot of traffic, so stop them when you're not demoing.
- **Pausing the queue** between sessions: see the end of [`queue_advance_cron.sql`](supabase/sql/queue_advance_cron.sql). Disable the cron job and set the `QUEUE_PAUSED=true` secret.
- **Secrets** belong in `.env`, `frontend/.env.local` and `supabase/.env.local`, all gitignored. Never put a service-role key in frontend code.
