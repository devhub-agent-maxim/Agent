# Project: Google Maps Delivery Logistics Tool

## Status
- **Phase**: Foundation (Phase 1 in progress)
- **Goal**: Automate delivery route planning using Google Maps API
- **Location**: `projects/delivery-logistics/`

## Architecture
- TypeScript CLI tool
- Google Maps Directions + Distance Matrix + Geocoding APIs
- Nearest-neighbor route optimization algorithm
- Domain structure: `src/maps/`, `src/routes/`, `src/cli/`

## Key Decisions
- Nearest-neighbor for MVP route optimization (fast, good enough for small sets)
- Mocked Maps API in tests (avoid API cost in CI)
- dotenv for API key management — never hardcode

## Environment
- Requires `GOOGLE_MAPS_API_KEY` in `.env`
- See `config/.env.example` for all required vars

## Tasks
- Full task list: `memory/projects/delivery-logistics/TASKS.md`
- Phase 1 complete: project structure created
- Next: tsconfig.json + deps install, then .env.example

## Phase Progress
- [x] Phase 1 — Project Foundation (structure created)
- [ ] Phase 2 — Google Maps Integration
- [ ] Phase 3 — Route Engine
- [ ] Phase 4 — CLI Interface
- [ ] Phase 5 — Integration & Polish
