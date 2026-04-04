# Project Spec: RouteFlow

> Spec for the RouteFlow delivery logistics optimizer. Milestones 1-5 are complete. Milestones 6-8 are the remaining v1 work.

## Config

- **project_dir:** projects/delivery-logistics
- **build_command:** npx next build
- **test_command:** npx jest --passWithNoTests
- **deploy:** vercel (auto via git push to main)
- **notify:** none

## Milestones

### Milestone 1: Core Route Engine COMPLETE
**Goal:** Build the nearest-neighbor route optimization algorithm that takes a list of addresses and returns an optimized delivery order.
**Files:** src/lib/route-engine.ts, src/types/index.ts
**Acceptance criteria:**
- [x] Route engine accepts array of addresses with lat/lng
- [x] Returns optimized route using nearest-neighbor heuristic
- [x] Handles edge cases: empty input, single address, duplicate addresses
- [x] Unit tests pass
**Dependencies:** none

### Milestone 2: Multi-Driver Optimization COMPLETE
**Goal:** Split a route across multiple drivers, balancing stop count and estimated travel time.
**Files:** src/lib/multi-driver.ts, src/types/index.ts
**Acceptance criteria:**
- [x] Accepts driver count parameter
- [x] Splits optimized route into balanced segments per driver
- [x] Each driver gets a contiguous geographic cluster
- [x] Unit tests pass
**Dependencies:** Milestone 1

### Milestone 3: Dashboard UI COMPLETE
**Goal:** Web dashboard where users paste addresses, configure drivers, and see optimized routes.
**Files:** app/page.tsx, app/dashboard/, app/components/
**Acceptance criteria:**
- [x] Address input via paste (one per line)
- [x] Driver count selector
- [x] Route optimization triggered on submit
- [x] Results displayed with per-driver route lists
**Dependencies:** Milestone 1, Milestone 2

### Milestone 4: Driver Mobile View COMPLETE
**Goal:** Shareable link for each driver showing their route with turn-by-turn stop list.
**Files:** app/driver/[id]/page.tsx, app/components/DriverRoute.tsx
**Acceptance criteria:**
- [x] Unique URL per driver route
- [x] Mobile-optimized layout
- [x] Stop list with addresses and sequence numbers
- [x] "Navigate" button opens Google Maps directions
**Dependencies:** Milestone 3

### Milestone 5: API + Dashboard Integration COMPLETE
**Goal:** REST API endpoints for route optimization, connected to the dashboard UI.
**Files:** app/api/optimize/route.ts, app/api/drivers/route.ts
**Acceptance criteria:**
- [x] POST /api/optimize accepts addresses and driver count, returns optimized routes
- [x] GET /api/drivers/[id] returns a specific driver's route
- [x] Dashboard calls API instead of running optimization client-side
- [x] Error responses for invalid input
**Dependencies:** Milestone 1, Milestone 2, Milestone 3

### Milestone 6: Google Maps Integration
**Goal:** Enable real map display on the dashboard and driver views, and handle Google Maps waypoint limits for routes with 25+ stops.
**Files:** app/components/RouteMap.tsx, src/lib/maps-url.ts, app/components/DriverRoute.tsx
**Acceptance criteria:**
- [ ] Map component renders when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY env var is set
- [ ] Map shows markers for all stops with driver color coding
- [ ] Routes with 25+ stops are split into multiple Google Maps navigation URLs
- [ ] Driver view displays split navigation links ("Leg 1 of 3", etc.)
- [ ] Graceful fallback when API key is not set (text-only mode)
**Dependencies:** Milestone 3, Milestone 4

### Milestone 7: Auth + Persistence
**Goal:** Users can sign up, log in, save routes, and view route history. Driver share links work without authentication.
**Files:** app/auth/login/page.tsx, app/auth/signup/page.tsx, src/lib/supabase.ts, app/dashboard/history/page.tsx, src/types/database.ts
**Acceptance criteria:**
- [ ] Supabase client configured (reads NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY from env)
- [ ] Sign up, log in, and log out flows work
- [ ] Authenticated users can save optimized routes to Supabase
- [ ] Route history page lists saved routes with date, stop count, and driver count
- [ ] Clicking a saved route loads it back into the dashboard
- [ ] Driver share links (/driver/[id]) work without authentication
**Dependencies:** Milestone 5

### Milestone 8: Polish + Launch
**Goal:** Production-ready polish — error handling, loading states, responsiveness, and stress testing.
**Files:** app/components/, app/layout.tsx, src/lib/
**Acceptance criteria:**
- [ ] All API errors display user-friendly messages (no raw stack traces)
- [ ] Loading spinners on optimize button, route save, and page transitions
- [ ] All pages responsive on mobile (tested at 375px width)
- [ ] 150-location stress test completes in under 5 seconds
- [ ] No TypeScript errors (tsc --noEmit passes)
- [ ] Build succeeds (next build passes)
**Dependencies:** Milestone 6, Milestone 7

### Milestone 9: Real Road Routing (OSRM)
**Goal:** Replace straight-line haversine distances with actual Singapore road network data using OSRM (Open Source Routing Machine). This gives real drive times, proper clustering by actual proximity on roads, and accurate ETAs — no API key needed.
**Files:** src/lib/osrm-client.ts, src/routes/optimizer.ts, app/api/routes/optimize/route.ts
**Acceptance criteria:**
- [ ] OSRM client calls `router.project-osrm.org` Table service to get real drive-time matrix for all stops
- [ ] Distance matrix uses actual road seconds/metres (not haversine straight-line)
- [ ] k-means clustering uses real drive-time distances so geographically close-on-roads stops go to same driver
- [ ] Nearest-neighbour route optimizer uses real road distances
- [ ] Falls back to haversine if OSRM API is unavailable (timeout 3s)
- [ ] 150-stop matrix fetch completes under 5 seconds
- [ ] ETA shown per driver uses real drive time
**Dependencies:** Milestone 2, Milestone 5
