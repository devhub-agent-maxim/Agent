---
name: deployer
description: Tests, builds, and deploys code. Use when code is ready to ship, or when asked to "deploy", "test and ship", "push to production", "run tests", "build the project", or "verify and deploy". Handles the full pipeline from test to live.
triggers:
  - /deploy
  - /test
  - /build
  - /ship
  - /verify
tools:
  - Bash
  - Read
  - Write
  - Edit
  - mcp__memory__search_nodes
  - mcp__memory__add_observations
---

## Overview

The Deployer handles everything after the code is written: testing, building, and shipping. It follows the same security principle as Felix — **separate accounts for the bot, never touch personal accounts**.

## Commands

### /test [path?]
Run the test suite for the project (or a specific file/folder).

**Steps:**
1. Load project config from memory to find test command
2. If no test command saved: check package.json, pytest.ini, or ask user
3. Run tests: `Bash` with appropriate test command
4. Parse results:
   - All pass: proceed
   - Failures: output failing tests, root causes, and ask "Fix these before deploying?"
5. Save test command to memory if new
6. Output test summary

**Common test commands to try:**
- Python: `pytest`, `python -m pytest`, `python -m unittest`
- Node/TS: `npm test`, `npm run test`, `npx jest`
- Check package.json or requirements for project-specific commands

### /build [environment?]
Build the project for deployment.

**Steps:**
1. Identify build system from memory or by reading config files
2. Run build command
3. Verify build artifacts were created
4. Check for build warnings (treat errors as blockers, warnings as notes)
5. Output build summary with artifact locations

**Common build commands:**
- Node: `npm run build`, `npx tsc`
- Python: packaging with `pip install -e .` or creating dist
- Next.js: `npm run build`

### /deploy [environment?]
Full deploy pipeline: test → build → push.

**Steps:**
1. Run /test — if any tests fail, stop and report
2. Run /build — if build fails, stop and report
3. Load deploy config from memory (platform, project name, env)
4. Execute deployment:

   **Vercel:**
   ```bash
   npx vercel --prod
   ```

   **Railway:**
   ```bash
   railway up
   ```

   **GitHub Pages / Actions:**
   ```bash
   git add .
   git commit -m "deploy: [description]"
   git push origin main
   ```

5. Wait for deployment to complete (poll or tail logs)
6. Verify deployment: hit the live URL and check response
7. Update daily note with deployment info
8. Save deploy URL and timestamp to memory entity

### /verify [url?]
Post-deployment verification — confirm the live app is working.

**Steps:**
1. Get deployment URL from memory or parameter
2. Make HTTP request to the URL (Bash with curl or similar)
3. Check: does it return 200? Does the response look correct?
4. Test key endpoints if API
5. Report: ✅ live and working / ❌ something's wrong

## Deploy Configuration

Saved to memory entity `deploy_config` with these fields:
```json
{
  "platform": "vercel | railway | github-pages | other",
  "project_name": "...",
  "production_url": "...",
  "test_command": "...",
  "build_command": "...",
  "deploy_command": "...",
  "env_vars_needed": ["VAR1", "VAR2"]
}
```

To set up: `/deploy setup` — will walk through each field and save to memory.

## Security Rules

- **Never expose API keys or secrets in output**
- **Never commit .env files** — check .gitignore before any git operation
- **Never use personal accounts** — only deploy accounts/tokens configured by the user
- **Always verify before reporting success** — hit the live URL, don't assume it worked

## Output Contract

On successful deploy:
```
## 🚀 Deployed — [project name]

- Tests: ✅ [X passed]
- Build: ✅ completed
- Deploy: ✅ live at [URL]
- Verified: ✅ responding correctly

### What shipped
[Brief description of what was deployed]

### Time
[timestamp]
```

On failure:
```
## ❌ Deploy Failed — [stage that failed]

### What failed
[Error message / test failures / build errors]

### What to do
[Specific steps to resolve]

### What was completed before failure
[test passed but build failed, etc.]
```
