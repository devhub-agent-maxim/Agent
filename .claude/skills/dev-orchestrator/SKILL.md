---
name: dev-orchestrator
description: Breaks down development goals into structured tasks, writes PRDs, delegates coding work, and tracks progress. Use when given a feature to build, a bug to fix, or a project to start. Triggers on: "build X", "implement X", "I want to add X", "create a PRD for", "plan this feature", "what's the next step", "orchestrate this".
triggers:
  - /orchestrate
  - /prd
  - /plan
  - /build
  - /breakdown
tools:
  - Read
  - Write
  - Bash
  - Agent
  - mcp__memory__search_nodes
  - mcp__memory__add_observations
  - mcp__memory__create_entities
---

## Overview

The Dev Orchestrator is your primary development workflow manager. It turns vague goals ("add route optimization to the delivery tool") into structured, executable work items — then delegates the actual coding to the Code Writer skill.

Inspired by: Felix's PRD → Codex delegation → monitoring workflow.

## Workflow

```
User Goal
   ↓
[Orchestrator] Loads context from memory
   ↓
[Orchestrator] Writes PRD (Product Requirements Document)
   ↓
[Orchestrator] Breaks PRD into task list (TASKS.md)
   ↓
[Code Writer]  Executes tasks one by one
   ↓
[Orchestrator] Monitors progress, updates daily note
   ↓
[Deployer]     Tests and ships when complete
```

## Commands

### /prd [feature description]
Write a Product Requirements Document for a feature.

**Steps:**
1. Load project context from memory: `mcp__memory__search_nodes` with project name
2. Read relevant existing code to understand current architecture (Read tool)
3. Write PRD to `memory\projects\[project-name]\PRD-[feature]-[date].md`
4. PRD must include:
   - **Goal**: One sentence — what this achieves
   - **Background**: Why we're building this, what problem it solves
   - **Current State**: What exists today that's relevant
   - **Requirements**: Numbered list of must-haves
   - **Out of Scope**: What we're NOT doing
   - **Technical Approach**: Files to create/modify, APIs to use, data structures
   - **Task List**: Ordered implementation steps (each step < 2 hours of work)
   - **Success Criteria**: How to verify it works
   - **Risks**: What could go wrong
5. Save PRD location to memory entity for the project
6. Ask user: "PRD ready. Should I start the Code Writer on this?"

### /plan [goal]
Quick planning without a full PRD — for small features or bug fixes.

**Steps:**
1. Assess scope: is this a 30-min task or multi-hour task?
2. If small (< 1 hour): create a simple TASKS.md with 3-7 steps, proceed directly
3. If large: redirect to /prd for proper planning
4. Output the plan for user review before starting

### /orchestrate [prd-file or description]
Full orchestration — coordinate all phases from planning to deployment.

**Steps:**
1. If no PRD exists: run /prd first
2. Read PRD and extract task list
3. Write `memory\projects\[project-name]\TASKS.md` with status tracking:
   ```
   ## Tasks — [PRD name] — [date]
   - [ ] Task 1: [description]
   - [ ] Task 2: [description]
   ...
   ```
4. For each task:
   a. Mark as `[→]` (in progress) in TASKS.md
   b. Spawn Code Writer sub-agent with task context
   c. Wait for completion
   d. Mark as `[✓]` (done) in TASKS.md
   e. Update daily note with progress
5. When all tasks done: trigger /deploy via Deployer skill
6. Update project memory entity with completion status

### /status
Check status of all active development work.

**Steps:**
1. Read all `TASKS.md` files in `memory\projects\`
2. Check daily note for what was worked on today
3. Query memory for active project entities
4. Output summary:
   ```
   ## Development Status — [DATE]

   ### Active Projects
   - [Project]: [X/Y tasks complete] — [current task]

   ### Blocked
   - [Project]: [what's blocking it]

   ### Completed Today
   - [task]
   ```

## PRD Template

Save to: `memory\projects\[project-name]\PRD-[feature]-YYYY-MM-DD.md`

```markdown
# PRD: [Feature Name]
Date: YYYY-MM-DD
Project: [Project Name]
Status: Draft | Approved | In Progress | Done

## Goal
[One sentence]

## Background
[Why are we building this?]

## Current State
[What exists today that's relevant]

## Requirements
1. [Must have]
2. [Must have]
3. [Nice to have — marked with *]

## Out of Scope
- [What we are NOT doing]

## Technical Approach
### Files to Modify
- `path/to/file.py` — [what to change]

### New Files
- `path/to/new.py` — [what it does]

### APIs / Libraries
- [API name]: [how it's used]

## Task List
1. [ ] [Task] — [estimated time]
2. [ ] [Task] — [estimated time]

## Success Criteria
- [ ] [How to verify requirement 1]
- [ ] [How to verify requirement 2]

## Risks
- [Risk]: [Mitigation]
```

## Rules

- **Never start coding without a plan** — even a 5-minute task gets a quick /plan
- **Always save PRD before starting** — so it can be recovered if session dies
- **One task in progress at a time** — don't parallelize unless explicitly told to
- **Update TASKS.md in real time** — the heartbeat uses this to monitor progress
- **Delegate coding to Code Writer** — the orchestrator plans, it does not implement

## Output Contract

After /prd: produces a markdown file at `memory\projects\[project]\PRD-[name]-[date].md`
After /orchestrate: produces updated `TASKS.md` and daily note entries
After /status: produces a status report (displayed, not saved)
