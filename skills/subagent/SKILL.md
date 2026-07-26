---
name: subagent
description: Spawns pi as a separate subagent process for edits, verification, reviews, research, or any delegated task whenever the user mentions a subagent, asks to delegate work, or invokes /skill:subagent.
---

# Subagent

“Subagent” means a separate `pi` process spawned by the current pi orchestrator. The orchestrator may delegate edits, implementation, verification, review, research, or any other bounded task it deems useful.

## Rules

- Delegate the requested task to the subagent instead of doing that task in the orchestrator's context.
- Prefer serial delegation: one subagent at a time, each finished before the next starts. This keeps the work reviewable and stops children racing on the same files. Fanning out is the exception — reserve it for genuinely independent pieces where waiting is the real cost, and say why before doing it.
- Run the subagent from the directory relevant to the task.
- Use `pi --print --no-session` so the child has isolated context and returns its result to the orchestrator.
- Pass a short, simple task as one shell-quoted prompt argument. For a multiline, quote-heavy, code-heavy, or synthesized prompt, write the exact prompt to a private temporary file outside the repository and redirect that file to pi's stdin. Do not squeeze complex prompts into a command argument or tell the child to read the prompt file itself.
- Remove temporary prompt files after the child exits, including on failure.
- If the user specifies a model, pass both `--provider <provider>` and `--model <model>`. Use the named provider when supplied. Otherwise, use `pi --list-models "<model>"` to find a configured provider; if both `litellm` and `bifrost` provide it, either is acceptable.
- If the user specifies an effort or thinking level, pass it with `--thinking <level>`.
- If no model is specified, inherit pi's configured defaults by omitting `--provider` and `--model`.
- Give the subagent the capabilities needed for its role. Omit `--tools` when it may edit, implement, verify, or otherwise use pi's normal tools; use an allowlist only when the task must be constrained, such as a read-only review.
- Do not use `eval` when constructing the command.
- Report the subagent's result. If the command fails, report its exit status and stderr; do not silently replace it with your own attempt.

## General Usage

Treat caller arguments (`$@`) as the delegated task. Pi supplies skill arguments as conversation text, not shell positional parameters: substitute them for `<task>` before running this command through bash; do not pass literal `$@` or `<task>`.

For a short, simple task:

```bash
pi --print --no-session \
  [--provider <provider> --model <model>] \
  [--thinking <level>] \
  "<task>"
```

Replace or omit the bracketed optional arguments rather than passing literal brackets. Shell-quote the task as data and preserve it as one prompt argument.

For a complex prompt:

1. Run `mktemp "${TMPDIR:-/tmp}/pi-subagent-prompt.XXXXXX"` and keep the returned path.
2. Use the `write` tool to put the exact delegated prompt at that path; do not construct it through shell interpolation. The file created by `mktemp` is private to the current user.
3. Substitute the returned path for `<prompt-file>` and run:

```bash
prompt_file="<prompt-file>"
trap 'rm -f -- "$prompt_file"' EXIT
pi --print --no-session \
  [--provider <provider> --model <model>] \
  [--thinking <level>] \
  < "$prompt_file"
```

Pi merges piped stdin into its initial prompt. Do not also pass the prompt as an argument.

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

## Long-running and Two-Way Tasks

For normal one-shot delegation, do not add tmux: the bash invocation already exposes output and cancellation. For a long-running subagent that needs human-visible monitoring or follow-up messages, run a persistent interactive pi session in tmux instead of `pi --print`.

For programmatic two-way communication, use pi's native `pi --mode rpc` JSONL protocol over the child's stdin/stdout. It supports prompts, steering, follow-ups, aborts, responses, and streamed events. Keep the process in tmux when it must survive beyond one bash tool call, and use a small Bun client or the bundled subagent extension when lifecycle management becomes non-trivial.

A named pipe is one-way. Two-way RPC can technically be transported through two FIFOs—one for commands and one for responses/events—but both ends must remain open and be drained concurrently or they can block, deadlock, or deliver EOF. Do not build an ad hoc FIFO protocol; use direct RPC pipes unless filesystem pipe endpoints are explicitly required.

If richer orchestration becomes necessary, start from pi's bundled `examples/extensions/subagent/` and follow the current pi extension and RPC documentation rather than expanding this skill into an ad hoc process manager.

## Maintenance

This skill lives in the `pi-ext` repo at `skills/subagent/`. If you find a bug while using it, fix it and commit the change to the repo first, before relying on the skill further.
