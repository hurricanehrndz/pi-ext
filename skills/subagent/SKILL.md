---
name: subagent
description: Spawns pi as a separate subagent process for edits, verification, reviews, research, or any delegated task whenever the user mentions a subagent, asks to delegate work, or invokes /skill:subagent.
---

# Subagent

“Subagent” means a separate `pi` process spawned by the current pi orchestrator. The orchestrator may delegate edits, implementation, verification, review, research, or any other bounded task it deems useful.

## Rules

- Delegate the requested task to the subagent instead of doing that task in the orchestrator's context.
- Run the subagent from the directory relevant to the task.
- Use `pi --print --no-session` so the child has isolated context and returns its result to the orchestrator.
- If the user specifies a model, pass both `--provider <provider>` and `--model <model>`. Use the named provider when supplied. Otherwise, use `pi --list-models "<model>"` to find a configured provider; if both `litellm` and `bifrost` provide it, either is acceptable.
- If the user specifies an effort or thinking level, pass it with `--thinking <level>`.
- If no model is specified, inherit pi's configured defaults by omitting `--provider` and `--model`.
- Give the subagent the capabilities needed for its role. Omit `--tools` when it may edit, implement, verify, or otherwise use pi's normal tools; use an allowlist only when the task must be constrained, such as a read-only review.
- Do not use `eval` when constructing the command.
- Report the subagent's result. If the command fails, report its exit status and stderr; do not silently replace it with your own attempt.

## General Usage

Treat caller arguments (`$@`) as the delegated task. Pi supplies skill arguments as conversation text, not shell positional parameters: substitute them for `<task>` before running this command through bash; do not pass literal `$@` or `<task>`.

```bash
pi --print --no-session \
  [--provider <provider> --model <model>] \
  [--thinking <level>] \
  "<task>"
```

Replace or omit the bracketed optional arguments rather than passing literal brackets. Shell-quote the task as data and preserve it as one prompt argument.

Examples:

```text
/skill:subagent investigate why the test suite is slow
/skill:subagent implement the requested parser using provider bifrost and model opus-4.8
/skill:subagent review the current branch diff
```

Wait for the command to finish, then return its output.

## Code Review

When the delegated task is code review:

- Do not inspect or review the code in the orchestrator; let the subagent do it.
- Give the child read-only tools: `read,grep,find,ls,bash`.
- Explicitly restrict bash to read-only inspection such as `git diff`, `git log`, and `git show`.
- Ask it to check bugs and logic errors, security issues, and error-handling gaps.

```bash
pi --print --no-session \
  --tools read,grep,find,ls,bash \
  [--provider <provider> --model <model>] \
  [--thinking <level>] \
  "Act as a read-only code reviewer. Review this scope: <review-scope>. Inspect the code yourself; the parent orchestrator will not inspect it. Look for bugs and logic errors, security issues, and error-handling gaps. Use bash only for read-only inspection commands; do not modify files or run destructive commands. Report actionable findings with severity, file paths, and line numbers. If there are no findings, say so explicitly."
```

Substitute the caller's review scope for `<review-scope>` before invoking the command.

## Long-running Tasks

For normal one-shot delegation, do not add tmux: the bash invocation already exposes output and cancellation. For a long-running subagent that needs monitoring, cancellation, or follow-up messages, run a persistent pi session in tmux instead of `pi --print`.

If richer orchestration becomes necessary, start from pi's bundled `examples/extensions/subagent/` and follow the current pi extension documentation rather than expanding this skill into an ad hoc process manager.

## Maintenance

This skill lives in the `pi-ext` repo at `skills/subagent/`. If you find a bug while using it, fix it and commit the change to the repo first, before relying on the skill further.
