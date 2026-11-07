# Kickoff prompt for Codex (or any coding agent)

Paste this into the agent after placing this folder at the repo root.

```
Read AGENTS.md first, then follow its read order. Build the Review App described in this
pack, starting at T1 in docs/TASKS.md and working in order. Hard restrictions are in
docs/RULES.md and override anything else. Do not guess: when something is unclear, add an
Open question to docs/DECISIONS.md and continue with unrelated tasks. Do not run migrations
against production and do not commit secrets. Read the current official docs for Next.js,
Neon, the email provider and exceljs before using them. After each task, tell me what
changed and what to test, in two or three lines.
```

## Follow-up prompts
- After Phase 1: "Run the auth tests in docs/TESTING.md and show failures only."
- Before release: "Do T19: walk R1 to R27 and fill the Rules review section in docs/DECISIONS.md with the file and test that proves each one."
- If a column is unclear: "Do not guess. Log the Open question and stop that task."
