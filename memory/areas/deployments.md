# Deployments

<!-- AGENT INSTRUCTIONS
This file is the authoritative deployment registry for all projects.
- deploy-agent.js reads this file to load project-specific deploy config
- deploy-agent.js writes to this file after every deployment
- Each project has its own ## [projectName] section
- Do NOT delete sections — the deploy agent updates them in place

Format for each project section:
## [projectName]
- **Last deploy**: YYYY-MM-DD HH:MM
- **Live URL**: https://...
- **Status**: ✅ healthy | ❌ failed | ⏳ pending
- **Deploy ID**: dpl_xxxx (Vercel) or git SHA (GitHub-only)
- **Target**: github | vercel | github,vercel
- **Notes**: any manual annotations
-->

## Overview

| Project | Status | Last Deploy | Live URL |
|---------|--------|------------|----------|
| delivery-logistics | — | — | — |

---

## delivery-logistics
- **Last deploy**: —
- **Live URL**: —
- **Status**: ⏳ not deployed yet
- **Deploy ID**: —
- **Target**: github,vercel
- **Notes**: Initial entry. Run `node scripts/agents/deploy-agent.js --project delivery-logistics --target github,vercel` to deploy.

---

<!-- New project sections are appended below by deploy-agent.js -->
