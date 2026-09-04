# AI-Powered Automatic Block Planning — SIH PS27

Working prototype: FastAPI + OR-Tools optimization backend, Next.js/TypeScript
frontend (Gantt chart, Leaflet map, Recharts analytics), built on your 7-dataset
plan (TMS/SMMS/TDMS maintenance, COA block availability, Assets, Trains, Railway
Network).

## What's actually implemented (not just described)

- **Synthetic data generator** matching your exact dataset schema (all 7 files,
  all columns) — `backend/generate_data.py`
- **AI optimization engine** (OR-Tools CP-SAT) that:
  1. Unifies TMS + SMMS + TDMS into one task pool
  2. Scores priority (criticality, urgency, safety_risk, overdue_days)
  3. Matches tasks to COA blocks (corridor + department + duration constraints)
  4. Solves: maximize scheduled priority, minimize traffic disruption
  5. Returns scheduled plan + unscheduled backlog + KPIs
  — tested end-to-end, solves to `OPTIMAL` in well under a second on demo-scale data.
- **FastAPI REST API** exposing all datasets, the optimizer, and analytics — auto docs at `/docs`
- **Next.js frontend**: dashboard (KPIs + run-optimization button + results table),
  Gantt block schedule, Leaflet network map with failure-risk overlay, analytics page

## Run it

### Backend
```bash
cd backend
pip install -r requirements.txt
python generate_data.py        # generates data/*.csv (run once)
uvicorn app.main:app --reload --port 8000
```
API docs: http://localhost:8000/docs

### Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```
App: http://localhost:3000

## Scaling to full dataset size

`backend/generate_data.py` has row-count constants at the top (`ROWS_TMS`,
`ROWS_SMMS`, etc.) currently set to demo scale for fast iteration. Bump these to
match the poster's ~5,900–9,100 total rows before your final submission — the
optimizer's `max_tasks` / `max_blocks` params in `/api/optimize/run` cap how much
the solver chews on per call, so full-size data still returns fast.

## Swapping in Postgres / real data

The backend currently reads CSVs directly for simplicity/demo-speed. To move to
PostgreSQL: add SQLAlchemy models mirroring the CSV schemas in `app/models.py`,
point `DATABASE_URL` at your Postgres instance, and swap `pd.read_csv(...)` calls
in `app/main.py` and `app/optimizer.py` for SQLAlchemy queries — the API contract
(endpoints, response shapes) doesn't need to change, so the frontend is unaffected.

## Project structure
```
backend/
  app/
    main.py        # FastAPI routes
    optimizer.py    # OR-Tools CP-SAT engine
  generate_data.py  # synthetic dataset generator (matches your schema)
  data/*.csv         # generated datasets
  requirements.txt
frontend/
  src/app/
    page.tsx         # dashboard
    blocks/page.tsx    # Gantt chart
    map/page.tsx        # Leaflet network map
    analytics/page.tsx  # Recharts breakdowns
  src/components/
  src/lib/api.ts       # typed API client
```

## For the jury demo

1. Show `/docs` briefly — a real, working API, not mockups.
2. On the dashboard, click **Run AI Optimization** live — the CP-SAT solver
   returns an optimal schedule in under a second, with the KPI panel showing
   % of priority-weighted backlog cleared.
3. Jump to the Gantt view to show the resulting block calendar.
4. Jump to the map to show corridor-level failure risk.
5. Close on the analytics page for backlog/traffic breakdowns.
