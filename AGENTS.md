# AGENTS.md — Coding guidelines for pi-ext

This file is auto-loaded by pi as context when working in this repository.
Follow every rule here unless the user explicitly overrides it.

---

## Repository purpose

`pi-ext` is a monorepo of **pi.dev extensions** and **skills** built with **Bun**.

- `extensions/` — TypeScript extension modules (one subdirectory per extension)
- `skills/` — Agent skill packages (one subdirectory per skill, each containing `SKILL.md`)

---

## Runtime & tooling

| Concern | Tool |
|---------|------|
| Runtime | **Bun** — use `bun`, never `node` or `npm` |
| Package manager | **Bun** — use `bun install`, never `npm install` |
| Test runner | **Bun** — use `bun test` |
| Language | **TypeScript** — all extension code is `.ts` |
| Schema / tool params | **typebox** (`import { Type } from "typebox"`) |
| Extension API | `@earendil-works/pi-coding-agent` (peer dep, never bundle) |

Never add `npm`, `yarn`, `pnpm`, or `node` invocations. Always use `bun`.

---

## Subagents

- “Subagent” always means a separate `pi` process spawned by the current pi orchestrator.
- Whenever the user mentions a subagent or asks to delegate work, read and follow `skills/subagent/SKILL.md`.
- Delegate any bounded task the orchestrator deems useful, including research, planning, implementation, edits, verification, testing, or review.
- Default to a one-shot child invoked through bash with `pi --print --no-session`, run from the directory relevant to the task.
- If the user specifies a model, pass both `--provider` and `--model`; pass `--thinking` when an effort or thinking level is specified.
- Omit `--tools` when the child needs normal pi capabilities. Use a tool allowlist only when the delegated role must be constrained, such as a read-only review.
- Do not duplicate the delegated work in the orchestrator. Wait for the child and report its result; surface its exit status and stderr if it fails.
- For long-running subagents that need monitoring, cancellation, or follow-up messages, run a persistent pi session in tmux instead of `pi --print`; keep `pi --print` for one-shot delegation.
- If this workflow needs richer orchestration in the future, use pi's bundled `examples/extensions/subagent/` as the starting point and follow the current pi extension documentation before implementing more machinery.

---

## Project structure rules

```
extensions/
  <name>/
    index.ts        ← required entry point, exports default function
    package.json    ← only if the extension has npm deps (use bun install)
    *.ts            ← helper modules imported from index.ts

skills/
  <name>/
    SKILL.md        ← required, frontmatter + instructions
    scripts/        ← helper scripts (prefer Bun/TS over bash)
    references/     ← supplementary docs loaded on-demand
```

Rules:
- Every extension lives in its own subdirectory under `extensions/`.
- Every skill lives in its own subdirectory under `skills/`.
- The extension entry point is always `index.ts`.
- The skill entry point is always `SKILL.md`.
- Do **not** create files at the repo root other than `package.json`, `README.md`, `AGENTS.md`, `bunfig.toml`, and `tsconfig.json`.

---

## Writing extensions

### Required shape

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // subscribe to events, register tools/commands/shortcuts/flags
}
```

Async factories are fine when startup async work (e.g. remote config fetch) is needed.

### Imports

- Peer deps (never bundle): `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`,
  `@earendil-works/pi-tui`, `@earendil-works/pi-agent-core`, `typebox`
- Node built-ins: use `node:fs`, `node:path`, etc. (not bare `fs`, `path`)
- npm runtime deps: add to the extension's own `package.json` under `dependencies`

### Tool definitions

- Use `Type.*` from `typebox` for all parameter schemas
- Use `StringEnum` from `@earendil-works/pi-ai` for union/enum parameters
  (Google-compatible alternative to `Type.Union`)
- Always return `{ content: [...], details: {...} }` from `execute`
- Provide `promptSnippet` and `promptGuidelines` when the tool needs to be
  discoverable by the LLM; guidelines **must** name the tool explicitly
  (write "Use <tool_name> when…" not "Use this tool when…")

### Events

- Prefer narrow event subscriptions — only subscribe to what the extension actually needs
- In `tool_call` handlers, use `isToolCallEventType` to narrow `event.input` types
- In `tool_result` handlers, use `isBashToolResult` etc. to narrow `event.details`
- Use `ctx.signal` for all abort-aware async work inside handlers
- Do cleanup in `session_shutdown`; restore state in `session_start`

### Commands

- Register with `pi.registerCommand("name", { description, handler })`
- Provide `getArgumentCompletions` when the command accepts structured arguments
- Session-control methods (`waitForIdle`, `newSession`, `fork`, `switchSession`,
  `navigateTree`, `reload`) are only available in command handlers, not event handlers

### UI

- Prefer `ctx.ui.notify` for informational messages
- Use `ctx.ui.confirm` before any destructive action
- Use `ctx.ui.setStatus` for persistent footer indicators
- Check `ctx.hasUI` before calling dialog methods in non-interactive contexts

### Error handling

- Never swallow errors silently; surface them via `ctx.ui.notify("…", "error")`
- Extensions must not crash pi — catch unexpected errors at handler boundaries

---

## Writing skills

### Required frontmatter

```yaml
---
name: <name>           # must match parent directory name, lowercase a-z 0-9 hyphens
description: <text>    # ≤1024 chars, specific and actionable — explains WHEN to use it
---
```

### Rules

- `name` must match the parent directory name exactly
- Description must say *what* the skill does **and** when to use it (bad: "Helps with X", good: "Does Y and Z when working with X files")
- Use relative paths from the skill directory (`./scripts/foo.ts`, `./references/API.md`)
- Prefer Bun/TypeScript scripts over bash where feasible
- Include a **Setup** section if any install step is required before first use
- Include a **Usage** section with concrete invocation examples

---

## Dependency management

- Run `bun install` at repo root for shared tooling
- Run `bun install` inside `extensions/<name>/` for extension-specific deps
- Never commit `node_modules/`; add it to `.gitignore`
- `@earendil-works/pi-coding-agent` and other pi core packages must be in
  `peerDependencies` with `"*"`, never in `dependencies` — they must not be bundled

---

## Code style

- TypeScript strict mode (`"strict": true` in `tsconfig.json`)
- No `any` — use proper types or `unknown`
- No `console.log` in production extension code; use `ctx.ui.notify` or pi's logger
- Prefer `async/await` over raw Promises
- Keep files small and focused; extract helpers to sibling `.ts` modules
- Use named exports for shared types; use default export only for the extension factory

---

## Testing

- Use `bun test` with `*.test.ts` files co-located with the code under test
- Unit-test pure utility functions; do not attempt to unit-test event handlers directly
- For manual integration testing: `pi -e ./extensions/<name>/index.ts`

---

## Git hygiene

- One extension or skill per PR/commit when possible
- Commit message format: `<type>(<scope>): <short description>`
  - types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
  - scope: extension or skill name (e.g. `feat(brave-search): add pagination`)
- Never commit secrets, API keys, or tokens

---

## Adding new extensions or skills (checklist)

**Extension:**
- [ ] Created `extensions/<name>/index.ts` with default export
- [ ] Added `package.json` if npm deps are needed, ran `bun install`
- [ ] Tested with `pi -e ./extensions/<name>/index.ts`
- [ ] Updated root `README.md` listing

**Skill:**
- [ ] Created `skills/<name>/SKILL.md` with valid frontmatter
- [ ] `name` in frontmatter matches directory name
- [ ] Description is specific and ≥ 30 characters
- [ ] Tested with `pi --skill ./skills/<name>`
- [ ] Updated root `README.md` listing
