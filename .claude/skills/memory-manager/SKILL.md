---
name: memory-manager
description: Manages the three-layer memory system. Use when asked to save context, update knowledge base, create daily notes, retrieve past decisions, or consolidate session learnings. Triggers on: "remember this", "save to memory", "what do we know about", "update knowledge", "daily note", "consolidate memory".
triggers:
  - /memory
  - /remember
  - /daily-note
  - /consolidate
tools:
  - Read
  - Write
  - Edit
  - Bash
  - mcp__memory__create_entities
  - mcp__memory__add_observations
  - mcp__memory__search_nodes
  - mcp__memory__open_nodes
  - mcp__memory__read_graph
  - mcp__memory__create_relations
---

## Overview

Three-layer persistent memory system inspired by Nat Eliason's Felix setup:

- **Layer 1 — Knowledge Graph** (MCP memory): Durable facts, decisions, people, projects
- **Layer 2 — Daily Notes** (markdown files): What's happening today, active tasks, decisions made
- **Layer 3 — Tacit Knowledge** (CLAUDE.md + entities): How the user works, preferences, hard rules

## Storage Locations

```
C:\Users\maxim\OneDrive\Desktop\test claude\
├── .claude\
│   └── skills\           # Skills library
├── memory\
│   ├── daily\            # YYYY-MM-DD.md daily notes
│   ├── projects\         # Per-project summaries
│   └── people\           # People/company knowledge
└── CLAUDE.md             # Operational manual + tacit knowledge
```

## Commands

### /memory save [topic]
Save important information from the current session.

**Steps:**
1. Identify what's worth saving (decisions, file paths, gotchas, preferences)
2. Call `mcp__memory__search_nodes` to check if entity exists
3. If entity exists: call `mcp__memory__add_observations` to append
4. If new entity: call `mcp__memory__create_entities` with type and observations
5. If relation needed: call `mcp__memory__create_relations`
6. Confirm what was saved

**Entity types to use:**
- `project` — active development projects
- `decision` — architecture choices and why
- `person` — people, their roles, how to work with them
- `tool` — tools, APIs, their quirks
- `user` — user preferences and working style
- `file` — important file locations and purposes

### /memory recall [topic]
Retrieve context about a topic.

**Steps:**
1. Call `mcp__memory__search_nodes` with the topic as query
2. If found, call `mcp__memory__open_nodes` for full detail
3. Summarize findings concisely
4. Check daily notes: read `memory\daily\YYYY-MM-DD.md` for today's context

### /daily-note [content]
Write or update today's daily note.

**Steps:**
1. Determine today's date from system or CLAUDE.md context
2. Check if `memory\daily\YYYY-MM-DD.md` exists
3. If exists: append new entry with timestamp
4. If new: create with standard template below
5. Update the `current_session` entity in memory graph

**Daily note template:**
```markdown
# YYYY-MM-DD

## Active Projects
- [project name]: [current status]

## Decisions Made
- [decision]: [why]

## Work Done
- [task completed]

## Pending / Blocked
- [what's waiting]

## Next Session
- [what to pick up first]
```

### /consolidate
Consolidate today's session into persistent memory. Run at end of session or on demand.

**Steps:**
1. Read today's daily note from `memory\daily\YYYY-MM-DD.md`
2. Read current memory graph: `mcp__memory__read_graph`
3. For each project mentioned today:
   - Search for existing project entity
   - Add new observations: progress made, decisions, blockers
4. For each new tool/API/gotcha discovered:
   - Create or update entity with the lesson learned
5. Update `project_context` entity with current overall state
6. Write summary of what was consolidated

## Rules

- **Never store file contents** — store paths and what they contain/do
- **Never store temporary debug info** — only durable knowledge
- **Create entity if mentioned 3+ times** or is a key project/person
- **Always update daily note** when making significant decisions
- **On session start**: search `project_context` and load relevant entities
- **On session end**: run /consolidate before closing

## Output

After any memory operation, output:
```
✅ Memory updated
- Entity: [name] ([type])
- Added: [what was stored]
- Relations: [any links created]
```
