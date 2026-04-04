---
name: ship-orchestrator
description: Spec-driven build orchestrator that automates the entire build, verify, fix, deploy cycle. Reads a project spec with milestones and executes each one sequentially — spawning coder agents, running verification (tests, build, type-check), auto-fixing failures, committing, and pushing. Invoke with "/ship" or "ship this project".
triggers:
  - /ship
  - ship this project
  - ship it
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
---

## Overview

The Ship Orchestrator is a fully autonomous build pipeline skill. Given a project spec file containing milestones, it executes each incomplete milestone end-to-end: implement, verify, fix (if needed), commit, push, and advance. The user invokes it once and it runs the entire pipeline to completion.

## Core Principle

**Spec in, shipped product out.** Each milestone is implemented, verified, and committed before moving to the next. Failures are automatically retried with fixer agents up to 3 times. The user does not need to intervene unless all retries are exhausted.

## Invocation

The user says `/ship [project-name]` or `ship this project`. If no project name is given, ask the user which project to ship.

## Pipeline Steps

### Step 0: Load the Spec

1. Determine the project name from the user's command
2. Read the spec file at `projects/[name]/specs/SPEC.md`
3. Parse the config block to extract:
   - `project_dir` — root directory for the project
   - `build_command` — the build command (e.g., `npx next build`)
   - `test_command` — the test command (e.g., `npx jest --passWithNoTests`)
   - `deploy` — deployment method (e.g., `vercel` for auto-deploy via git push)
   - `notify` — notification channel (optional)
4. Parse all milestones and identify which are already marked as COMPLETE
5. Read `projects/[name]/specs/PROGRESS.md` if it exists, to cross-reference completed milestones
6. Build the list of incomplete milestones to execute

### Step 1: For Each Incomplete Milestone

Execute the following sub-steps sequentially for each milestone:

#### 1a. Implement

Spawn a coder agent using the Agent tool with the following instructions:

```
You are implementing Milestone [N]: [Name] for the [project-name] project.

Project directory: [project_dir]
Goal: [milestone goal]
Files to create/modify: [milestone files]
Acceptance criteria:
[list of criteria]

Dependencies: [milestone dependencies]

Instructions:
- Read existing project files first to understand the codebase
- Implement the milestone goal completely
- Ensure all acceptance criteria are met
- Write clean, production-quality code
- Add appropriate error handling
- Do NOT run tests or build — the orchestrator handles verification
- When done, report what files you created or modified
```

Wait for the agent to complete and collect its output.

#### 1b. Verify

Run verification commands sequentially in the project directory. Check for the existence of config files before running optional checks.

```bash
# 1. Run tests (if test_command is configured)
cd [project_dir] && [test_command]

# 2. Run build (if build_command is configured)
cd [project_dir] && [build_command]

# 3. Type check (only if tsconfig.json exists in project_dir)
cd [project_dir] && npx tsc --noEmit
```

Collect all output. If ALL commands exit with code 0, verification PASSES. If ANY command fails, verification FAILS.

#### 1c. Fix (if verification failed)

If verification failed, enter the fix loop (max 3 attempts):

1. Spawn a fixer agent using the Agent tool with the following instructions:

```
You are fixing verification failures for Milestone [N]: [Name] in the [project-name] project.

Project directory: [project_dir]

The following verification step(s) failed:

[paste the exact error output from the failed command(s)]

Instructions:
- Read the failing files to understand the issue
- Fix the root cause — do not just suppress errors
- Ensure your fix does not break other milestones
- Report what you changed and why
```

2. Wait for the fixer agent to complete
3. Re-run the full verification suite (1b)
4. If verification passes, exit the fix loop
5. If verification fails again, increment the attempt counter and repeat
6. If 3 fix attempts are exhausted and verification still fails:
   - Log the failure in PROGRESS.md
   - Report to the user: "Milestone [N] failed after 3 fix attempts. Errors: [summary]. Stopping pipeline."
   - STOP the pipeline — do not continue to the next milestone

#### 1d. Commit and Push

If verification passes:

1. Stage all changed files in the project directory:
   ```bash
   git add projects/[name]/
   ```

2. Commit with a descriptive message:
   ```bash
   git commit -m "feat([project-name]): milestone [N] — [milestone name]

   [brief description of what was implemented]

   Acceptance criteria met:
   - [criterion 1]
   - [criterion 2]

   Co-Authored-By: claude-flow <ruv@ruv.net>"
   ```

3. Push to main:
   ```bash
   git push origin main
   ```

#### 1e. Update Progress

1. Update `projects/[name]/specs/PROGRESS.md`:
   - Mark the milestone as complete with a checkmark
   - Add a timestamp
   - Note any issues encountered during fix attempts

2. Update `memory/projects/[name]/progress.md` (create if it doesn't exist):
   - Write current pipeline status
   - List completed and remaining milestones

3. Commit the progress update:
   ```bash
   git add projects/[name]/specs/PROGRESS.md memory/projects/[name]/
   git commit -m "docs([project-name]): update progress — milestone [N] complete

   Co-Authored-By: claude-flow <ruv@ruv.net>"
   git push origin main
   ```

#### 1f. Advance to Next Milestone

Move to the next incomplete milestone and repeat from Step 1a.

### Step 2: Final Summary

After all milestones are complete (or the pipeline stops due to failure):

1. Read the final PROGRESS.md
2. Output a summary to the user:

```
## Ship Complete: [project-name]

### Results
- Milestones completed: [X] / [total]
- Milestones failed: [Y] (if any)
- Commits pushed: [count]

### Milestone Summary
- [x] Milestone 1: [name] — completed
- [x] Milestone 2: [name] — completed
- [ ] Milestone 3: [name] — failed (reason)

### Next Steps
[Any remaining work or recommendations]
```

3. Update memory with final status

## Error Handling

- **Agent timeout**: If a coder or fixer agent does not respond within a reasonable time, log the issue and report to the user
- **Git conflicts**: If git push fails due to conflicts, pull first with `git pull --rebase origin main`, then retry the push. If rebase fails, report to the user
- **Missing spec**: If the spec file doesn't exist, tell the user and provide the path where it should be created
- **Missing dependencies**: If a milestone has dependencies on incomplete milestones, skip it and report

## Important Rules

- ALWAYS read files before editing them
- NEVER modify files outside the project directory unless updating memory/progress
- ALWAYS verify before committing — never commit broken code
- ALWAYS push after each milestone — incremental delivery
- Keep commit messages descriptive and reference the milestone
- If the project has no test or build command configured, skip that verification step
- Pull from origin before starting to ensure the branch is up to date
