# Project Spec: [Project Name]

> This spec drives the Ship Orchestrator (`/ship`). Define your milestones here and the orchestrator will implement, verify, fix, commit, and push each one automatically.

## Config

- **project_dir:** projects/[project-name]
- **build_command:** npm run build
- **test_command:** npx jest --passWithNoTests
- **deploy:** vercel (auto via git push to main)
- **notify:** none

## Milestones

### Milestone 1: [Name]
**Goal:** [What this milestone achieves — one clear sentence]
**Files:** [Key files to create or modify, comma-separated]
**Acceptance criteria:**
- [ ] [Specific, testable criterion]
- [ ] [Another criterion]
**Dependencies:** none

### Milestone 2: [Name]
**Goal:** [What this milestone achieves]
**Files:** [Key files to create or modify]
**Acceptance criteria:**
- [ ] [Criterion]
- [ ] [Criterion]
**Dependencies:** Milestone 1

### Milestone 3: [Name]
**Goal:** [What this milestone achieves]
**Files:** [Key files to create or modify]
**Acceptance criteria:**
- [ ] [Criterion]
**Dependencies:** Milestone 1, Milestone 2

---

## Writing Good Milestones

1. **Keep milestones small** — each should be completable in one coding session (30-60 min of agent work)
2. **Be specific about files** — the coder agent works faster with clear file targets
3. **Make criteria testable** — "API returns 200" not "API works well"
4. **Order by dependency** — the orchestrator executes milestones in order
5. **Mark completed milestones** — add `COMPLETE` after the milestone name:
   ```
   ### Milestone 1: Setup COMPLETE
   ```
