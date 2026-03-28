# Tasks — Google Maps Delivery Logistics Tool
# Updated: 2026-03-27
# Progress: 0/12

## Phase 1 — Project Foundation
- [✓] Set up project structure: src/, tests/, config/ directories with package.json — 30min
- [ ] Create TypeScript config (tsconfig.json) and install core dependencies (typescript, dotenv, axios) — 20min
- [ ] Set up environment config: .env.example with GOOGLE_MAPS_API_KEY placeholder — 10min

## Phase 2 — Google Maps Integration
- [ ] Create src/maps/client.ts — Google Maps API wrapper (Directions, Distance Matrix, Geocoding) — 45min
- [ ] Create src/maps/geocoder.ts — address → coordinates converter with caching — 30min
- [ ] Write tests/maps/client.test.ts — unit tests with mocked Maps API responses — 30min

## Phase 3 — Route Engine
- [ ] Create src/routes/optimizer.ts — core route optimization logic (nearest-neighbor algorithm) — 60min
- [ ] Create src/routes/planner.ts — takes delivery list → returns ordered route with ETAs — 45min
- [ ] Write tests/routes/optimizer.test.ts — test with sample delivery datasets — 30min

## Phase 4 — CLI Interface
- [ ] Create src/cli/index.ts — CLI entry point (add deliveries, generate route, export) — 45min
- [ ] Create src/cli/reporter.ts — terminal output: route summary, total distance, ETA per stop — 30min

## Phase 5 — Integration & Polish
- [ ] End-to-end test: real addresses → optimized route → printed output — 30min
