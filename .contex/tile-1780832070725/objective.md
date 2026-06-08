# Objective

## Available Skills & Tools
- @discovered-/Users/jkneen/Documents/GitHub/tinyworld/.claude/skills/tinyworld-i18n/SKILL.md — Add, translate, or audit TinyWorld UI strings across English/French/Chinese/Spanish. Use when adding user-facing gameplay text, when `npm run i18n:check` fails, when a string shows up in English in a non-English locale, or when adding a new language. No translation API — Claude does the translating directly, using the established glossary for consistency.
- @command:/clear — Clear conversation
- @command:/compact — Compact conversation
- @command:/export-notes — Copy all attached block notes to the clipboard
- @command:/help — Show help
- @command:/init — Initialize workspace
- @command:/mode — Switch mode (plan, build, etc.)
- @command:/model — Switch model

## Communication Protocol
Use these MCP tools to report progress:

| Tool | When |
|------|------|
| update_task(channel, task_id, status) | Update task status |
| create_task(channel, title) | Create a new task |
| reload_objective(tile_id) | Get latest objective |
| pause_task(channel, task_id, reason) | Pause a task |
| get_context(tile_id) | Read context files |
| notify(channel, message) | Send notification |

Your tile channel: tile:tile-1780832070725

## Rules
1. Re-read this file when you receive a reload signal
2. Update task status via MCP tools as you work
3. Call notify when you need human attention

Generated: 2026-06-07T11:34:31.819Z