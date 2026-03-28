# 🤖 Autonomous Task Queue

The heartbeat reads this file every 30 minutes.
Add tasks here and the agent will work through them automatically.

## How to add tasks (via Telegram):
Send: `task: build X` or `add task: do Y`
Or add directly to the Pending section below.

---

## 🔄 In Progress
<!-- Heartbeat moves tasks here when it starts working on them -->

---

## 📋 Pending
<!-- Add new tasks here — agent picks from top to bottom -->

- [ ] **BLOCKED**: Update GitHub PAT with 'workflow' scope — Current token lacks 'workflow' scope, preventing push of `.github/workflows/agent-tools-test.yml`. Maxim needs to regenerate token at https://github.com/settings/tokens with additional 'workflow' scope checked, then update in local git credentials.


---

## ✅ Completed
- [x] TASK-004 | Test worker spawning: echo "Hello from Claude worker" and verify the worker completes successfully *(done: 28/03/2026, 7:40 pm)*
- [x] TASK-003 | Scan memory/projects/delivery-logistics/ and write a proper context.md + TASKS.md for that project based on what exists *(done: 27/03/2026, 4:00:03 pm)*
- [x] TASK-002 | Create memory/user/preferences.md documenting my tech stack preferences, communication style, and how I like to work *(done: 27/03/2026, 3:30:08 pm)*
- [x] TASK-001 | Set up the workspace structure: create projects/_template/ with standard tsconfig.json, jest.config.js, package.json, src/, tests/, config/ folders — the base for every new project *(done: 27/03/2026, 3:07:06 pm)*
<!-- Heartbeat moves finished tasks here with timestamp -->

