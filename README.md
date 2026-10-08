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
├── demo-prep.js                  one-shot setup for the demo stage
└── fuel-factors.js               reads fuel studies with Gemini into reviewed, sourced figures
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
| 1 | `schema.sql` (needs the `postgis` and `pg_cron` extensions), then `fix_spatial_ref_sys_grants.sql` to stop the public API from writing to PostGIS's reference table |
| 2 | `caiabe_seed_routes.sql`, then `fix_balibago_route.sql` |
| 3 | `rpc_functions.sql`, `lookup_functions.sql`, `transfer_functions.sql` |
| 4 | `add_terminal_geofence_queue.sql` |
| 5 | `add_route_visible_drivers_rpc.sql`, then `fix_route_visible_drivers_security.sql` |
| 6 | `add_driver_demand_functions.sql` |
| 7 | `add_landmarks.sql`, then `add_demo_sm_clark_landmark.sql` |
| 8 | `add_sms_log.sql`, `add_sms_sessions.sql`, then `add_demo_control.sql` |
| 9 | `add_vehicle_type.sql`, `add_discount_type.sql`, `add_driver_license_permit_numbers.sql`, `add_driver_document_photos.sql`, `add_driver_rejection_reason.sql` |
| 10 | `add_admins.sql`, `add_admin_driver_delete_policy.sql` |
| 11 | `add_performance_indexes.sql`, `storage_setup.sql`, `add_fuel_factors.sql`, `add_carbon_impact.sql`, then `add_driver_fuel_impact.sql` |
| 12 | `queue_advance_cron.sql`, **after** step 2 below. First change the project URL and anon key inside it to your own. |
| 13 | `add_cron_history_cleanup.sql`: nightly cleanup of pg_cron's run history, which otherwise grows until it fills the free plan's database space |

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
node --env-file=.env mock-fleet-simulator.js --jeeps=3 --delay=2000 --route="Checkpoint - Holy Angel University - Balibago"
node --env-file=.env mock-fleet-simulator.js --jeeps=2 --delay=2000 --route="Pampang - SM Telabastagan"
node --env-file=.env mock-passenger-simulator.js --route="Florida"   # optional; type surge / clear / list
```

Open **`/demo/stage`**. Use **Space** or **→** to go to the next step and **←** to go back.

**The passenger's whole trip plays out on its own** (Astro Park → SM City Telabastagan, grey jeep, transfer, yellow jeep). After she taps **"I'm here"**:
1. The first jeep with open seats that reaches her picks her up, and her screen switches to **ON BOARD**. A full jeep drives past.
2. Her screen follows that jeep to the transfer stop with a progress bar, then shows **TRANSFER**, walks her to the yellow stop and waits there.
3. The next open yellow jeep picks her up. She rides to the end, walks the last stretch, and sees **You've arrived** with the fare and the CO₂ she saved.

To keep it short, the jeeps are **fast-forwarded** (default ×8; tap the **Demo speed** chip to switch between ×1, ×4 and ×8). The passenger screen sends the speed to the fleet simulator through the `demo_commands` table (as a `resume` command with a `multiplier`), so the simulator must be running. A **Skip ahead (demo)** button on the riding screen moves to the next step if a jeep ever stalls.

The Carbon Impact overlay starts at zero each day (Philippine time). Before presenting:
- Take one passenger trip through to "I'm at the bay".
- Have drivers queued at a terminal.

That way the panel shows real numbers.

---

## Fuel and carbon model

Every figure is an **estimate**, and the UI labels it that way. All of it comes from one module, [`supabase/functions/_shared/fuel.ts`](supabase/functions/_shared/fuel.ts).

Each figure except CO₂ comes from approved sources in the `fuel_factors` table when there are any (see [Sourcing fuel figures](#sourcing-fuel-figures)). Otherwise it uses the built-in default. Run `fuel-factors.js summary` to see what the app is using right now.

**In use as of 8 Oct 2026:**

| Input | In use | Default | Source |
|---|---|---|---|
| Diesel → CO₂ | 2.68 kg/L | 2.68 kg/L | [IPCC 2006 Guidelines, Vol. 2 Ch. 3](https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/2_Volume2/V2_3_Ch3_Mobile_Combustion.pdf) (fixed; combustion chemistry) |
| Gasoline → CO₂ | 2.31 kg/L | 2.31 kg/L | IPCC 2006 (fixed) |
| Diesel price | **₱92.77/L** | ₱85/L | DOE North Luzon report, 29 Sep – 5 Oct 2026, Angeles City: ₱89.33–₱96.20 (midpoint) |
| Gasoline (RON 91) price | **₱85.32/L** | ₱65/L | Same DOE report: ₱82.24–₱88.40 (midpoint) |
| Jeepney mileage | **5.86 km/L** | 4 km/L | Median of 3 on-road measurements, 5.53–6.7 km/L ([EASTS LPG benchmark](https://easts.info/on-line/proceedings/vol10/pdf/1325.pdf); [CME-diesel blend study](https://www.jstage.jst.go.jp/article/easts/11/0/11_44/_pdf)) |
| Tricycle mileage | **27.59 km/L** | 30 km/L | 2-stroke 23.4 and 4-stroke 31.77 km/L ([ASEAN Engineering Journal, Tuguegarao](https://journals.utm.my/aej/article/download/20477/8419/80794)) |
| Jeepney idle burn | 1.2–1.8 L/hr | 1.2–1.8 L/hr | **No source yet.** No jeepney-specific study found; a tank-refill test is the best option |
| Average jeepney load | 12 riders | 12 riders | **Default kept on purpose.** Baguio's measured 17.32 is pending; its jeepneys run unusually full (82%) |
| Comparison car | 10 km/L | 10 km/L | **No source yet.** Gasoline car, one occupant |

Prices change every week. Update them from the newest DOE report (see below).

What the **Carbon Impact panel** counts ([`add_carbon_impact.sql`](supabase/sql/add_carbon_impact.sql)):
- **CO₂ avoided** = engine-off queue time at terminals. It assumes engines are switched off while queued. **Riders are not counted**: the app can't know how many people actually chose to ride, so the panel shows no rider tile and none of its numbers depend on one. (The backend still logs `rider_trip` events; nothing reads them into this panel.)
- **Idling caught** = roadside idle burn that Sak.AI flagged. This fuel was already wasted, so it is reported separately and **never** added to "avoided".

The panel above is fleet-wide (admin dashboard and the demo stage map). Each driver sees their **own** version on their phone: **Your impact today** on the queue screen and while driving (CO₂ avoided, engine-off queue time, idling caught), and the fuller "Your Fuel & CO₂" card on their dashboard. These come from `get_driver_impact_summary` and are the driver's own figures only.

Quick conversion for the pitch: at ₱92.77/L, **₱100 of diesel saved ≈ 1.08 L ≈ 2.9 kg CO₂ not emitted.**

### Sourcing fuel figures

[`fuel-factors.js`](fuel-factors.js) sends a study or DOE price report (PDF) to Gemini, which returns each matching figure along with the exact sentence it came from. The script rejects figures whose number isn't in that quote or that fall outside a plausible range, and saves the rest to `fuel_factors` as **pending**. Nothing is used until a person finds the quote in the document and approves it.

```bash
node --env-file=supabase/.env fuel-factors.js extract <pdf path or URL> --dry-run   # see what Gemini finds, saves nothing
node --env-file=supabase/.env fuel-factors.js extract <pdf path or URL>             # save findings as pending
node --env-file=supabase/.env fuel-factors.js list                                  # review: value, page, quote
node --env-file=supabase/.env fuel-factors.js approve <id> ...                      # or: reject <id> --notes="why"
node --env-file=supabase/.env fuel-factors.js summary                               # what the app is using now
```

- **How approved figures are used:** for each factor, the app takes the median of all approved sources. For the idle range, it uses the lowest and highest. Prices only use the newest `--date`, so approving this week's DOE report replaces last week's.
- **Where they take effect:** edge functions pick up approvals within 10 minutes. The SQL impact summaries pick them up immediately. Any factor without an approved source keeps its default.
- **Your own measurements:** for example, a tank-refill idle test. Add them with `add --key=jeepney.idle_liters_per_hour --value=1.4 --title="..." --quote="..."`.
- **When reviewing:** reject lab constant-speed mileage tests, seating capacity mistaken for riders, and prices for cities other than Angeles. Approve **one** figure per study and condition (its overall average, not every row of its table), so no single study outweighs the rest in the median.
- **Model:** extraction uses `gemini-3.5-flash`. `gemini-3.5-flash-lite` missed figures stated plainly in the text. To try another model, set `GEMINI_EXTRACT_MODEL`.

**Weekly price update** (run from the `cAIabe` folder):

1. On the [DOE North Luzon page](https://doe.gov.ph/data-and-prices/liquid-fuels/retail-pump-prices/north-luzon-pump-prices), right-click the newest week and copy the link address. A report is posted after its week ends.
2. Extract the prices:
   ```bash
   node --env-file=supabase/.env fuel-factors.js extract "<pdf link>" --date=<first day of that week, e.g. 2026-10-06>
   ```
3. Run `list`. In the PDF, find the Angeles City rows in the Central Luzon (Region III) table. If diesel and RON 91 match, `approve` those IDs.
4. Run `summary` to confirm the new prices. The older week stops being used automatically.

Re-running `extract` on a report that's already loaded is harmless: rows already on file are skipped.

Documents already processed (re-running them is harmless):
- [EASTS LPG jeepney benchmark](https://easts.info/on-line/proceedings/vol10/pdf/1325.pdf): jeepney mileage
- [CME-diesel blend study, EASTS Vol. 11](https://www.jstage.jst.go.jp/article/easts/11/0/11_44/_pdf): jeepney mileage; per-jeepney occupancy is pending
- [NCTS Baguio jeepney study](https://ncts.upd.edu.ph/tssp/wp-content/uploads/2017/07/TSSP2017-06-Ranosa-Fillone-and-De-Guzman.pdf): average riders, pending
- [ASEAN Engineering Journal tricycle study](https://journals.utm.my/aej/article/download/20477/8419/80794): tricycle mileage
- [Philippine Transportation Journal 2023](https://ncts.upd.edu.ph/tssp/wp-content/uploads/2023/07/TSSP2023_Vol6-No1_02-Sigua-Briones-Macamus-Pongos-Tumaliuan-Vitug.pdf): rejected; its figures are model assumptions, not measurements. Use the address without `www.`, which has a certificate error.
- DOE North Luzon report, 29 Sep – 5 Oct 2026: Angeles City diesel and RON 91 prices. These PDFs are scans, so check prices against the page image, not by text search.

---

## Operating notes

- **Free-tier egress.** `queue-advance` runs every minute but only makes its HTTP call while someone is actually queued. The simulators generate a lot of traffic, so stop them when you're not demoing.
- **Pausing the queue** between sessions: see the end of [`queue_advance_cron.sql`](supabase/sql/queue_advance_cron.sql). Disable the cron job and set the `QUEUE_PAUSED=true` secret.
- **Secrets** belong in `.env`, `frontend/.env.local` and `supabase/.env.local`, all gitignored. Never put a service-role key in frontend code.
