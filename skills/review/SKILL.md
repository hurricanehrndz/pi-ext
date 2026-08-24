---
name: review
description: Run a read-only subagent review of the current branch diff against main or master.
disable-model-invocation: true
---

# Review the current branch

Delegate the review to one read-only child. Follow the
[subagent skill](../subagent/SKILL.md) for the parent/child boundary, model
selection, tool restrictions, invocation, cleanup, and failure reporting. Treat
caller arguments as additional review instructions or model preferences; the
user's explicit choices win.

## Review scope

Ask the child to:

1. Find the base branch in this order: `main`, `origin/main`, `master`, then
   `origin/master`.
1. If none exists, report that clearly and stop.
1. Review only the current branch changes from the merge-base diff, equivalent
   to `git diff <base>...HEAD`. Inspect surrounding code only when needed to
   judge those changes.
1. Use read-only inspection commands. Do not modify files or run builds or
   tests.
1. Check for bugs and logic errors, security issues, error-handling gaps, and
   regressions or compatibility problems introduced by the diff.
1. Prioritize actionable findings over style comments. Include file paths and
   line numbers where possible. Say explicitly when there are no findings.

## Report

Return the child's findings under these headings:

```text
Files reviewed

Critical (must fix)

Warnings (should fix)

Suggestions (consider)

Summary
```

Omit empty severity sections. Keep the summary to two or three sentences.
