---
description: Run a code review sub-agent on the current branch diff against main/master
---
Spawn yourself as a sub-agent via bash to do a code review of the current branch diff against `main` or `master`: $@

Use `pi --print` with appropriate arguments. By default, use `--provider litellm-bedrock --model coding-leader-1m` (confirmed in `agent/models.json`). If the user specifies a different model, use `--provider` and `--model` accordingly.

Bash is for read-only commands only: `git diff`, `git log`, `git show`. Do NOT modify files or run builds. Assume tool permissions are not perfectly enforceable; keep all bash usage strictly read-only.

Do not read the code yourself. Let the sub-agent do that.

Pass a prompt to the sub-agent asking it to:
- Determine the repository's base branch, preferring `main`, then `master`, including remote variants (`origin/main`, `origin/master`) if needed.
- Review only the current branch changes relative to that base branch, using the merge-base diff (for example, `git diff <base>...HEAD`).
- If no `main`/`master` base branch can be found, report that clearly and stop.

Ask the sub-agent to review the branch diff for:
- Bugs and logic errors
- Security issues
- Error handling gaps
- Regressions or compatibility issues introduced by the diff

Ask the sub-agent to include file paths and line references where possible, and to prioritize actionable findings over style comments.

Use this output format:

Files Reviewed

- `path/to/file.ts` (lines X-Y)

Critical (must fix)

- `file.ts:42` - Issue description

Warnings (should fix)

- `file.ts:100` - Issue description

Suggestions (consider)

- `file.ts:150` - Improvement idea

Summary

Overall assessment in 2-3 sentences.

Report the sub-agent's findings.
