# Agent Migration Guide

Your autonomous agent infrastructure is ready to move to your PC. Two files are needed:

## Files to Download

1. **agent-repo.bundle** (8.8 MB) - Complete git history & all branches
2. **agent-files.tar.gz** (1.1 MB) - All project files, config, memory

Both are in the current directory.

---

## Setup on New PC

### Step 1: Create Project Directory
```bash
cd your-workspace
mkdir agent-workspace
cd agent-workspace
```

### Step 2: Restore Git Repository
```bash
# Create empty repo
git init

# Add bundle as remote (temporary)
git remote add bundle /path/to/agent-repo.bundle

# Fetch all branches and history
git fetch bundle '*:*'

# Remove temporary remote
git remote remove bundle

# Set upstream to origin (or your GitHub if you have one)
# git remote add origin https://github.com/your-username/agent
```

### Step 3: Restore Project Files
```bash
# Extract files
tar -xzf /path/to/agent-files.tar.gz -C .

# Check out the main branch
git checkout main

# Check out the active development branch
git checkout claude/serene-lamarr
```

### Step 4: Install Dependencies
```bash
npm install
npm run build
npm test
```

### Step 5: Configure Environment
Create `.env` file:
```bash
TELEGRAM_BOT_TOKEN=your_token_here
TELEGRAM_GROUP_ID=your_group_id
TELEGRAM_USER_ID=your_user_id
GITHUB_TOKEN=your_github_token
GITHUB_USERNAME=your_username
```

⚠️ **CRITICAL**: Never commit `.env` files

### Step 6: Start Agent
```bash
node scripts/agent.js
```

Dashboard will be available at: `http://localhost:3000/?token=agent`

---

## What's Included

✅ All source code (projects/, scripts/, tests/)
✅ Configuration (.claude/, .mcp.json, CLAUDE.md)
✅ Memory system (memory/ with patterns, daily notes, projects)
✅ Git history (all branches, commits, tags)
✅ Project threads mapping (memory/project-threads.json)
✅ Usage tracking (memory/usage-log.jsonl)

❌ **NOT included** (for security):
- node_modules/ (rebuilt via npm install)
- .env files (create fresh on new PC)
- .git/ folder (restored from bundle)

---

## Verify Everything Works

After setup:
```bash
npm test              # All tests should pass
npm run build         # Should compile without errors
node scripts/agent.js # Should boot and connect to Telegram
```

---

## Quick Steps Summary

```bash
# On new PC:
cd workspace
mkdir agent && cd agent
git init
git remote add bundle /path/to/agent-repo.bundle
git fetch bundle '*:*'
git remote remove bundle
tar -xzf /path/to/agent-files.tar.gz -C .
git checkout claude/serene-lamarr
npm install
# Create .env with your tokens
node scripts/agent.js
```

---

## Using GitHub Instead (Optional)

If you want to use GitHub:
1. Create private repo on GitHub
2. Push from this machine: `git push -u origin main claude/serene-lamarr`
3. On new PC: `git clone <repo-url>`
4. Follow Step 4-6 above

This way you don't need to copy files manually.

