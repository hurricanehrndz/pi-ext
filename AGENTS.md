# AGENTS.md — Coding guidelines for pi-ext

## Repository purpose and ownership

`pi-ext` contains Pi-only TypeScript extensions and portable Agent Skills.

- `extensions/<name>/index.ts` is delivered through `package.json` →
  `pi.extensions` and runs only in Pi.
- `skills/<name>/SKILL.md` is installed only by `scripts/agent-toolkit.ts`.
- `agent-toolkit.json` is the complete source of truth for each skill's Pi,
  Prime, Codex, and Claude scope. Every discovered skill must be configured
  explicitly.
- `prompts/review.md` is retained but is not currently delivered. Do not add
  prompt delivery incidentally.
- Do not add `pi.skills`; the cross-agent installer must remain the sole owner
  of Pi skill links.

Do not rename the package/repository or change its remote identity without an
explicit decision.

## Runtime and tooling

| Concern | Tool |
| -- | -- |
| TypeScript runtime/package manager/tests | Bun 1.3.13 |
| Portable web helper | CPython 3.14.7 standard library, selected by its executable uv-script entry point |
| Development tasks | mise (`mise run …`) with `settings.locked = true` |
| Python development dependencies | uv with the root `pyproject.toml` and `uv.lock` |
| Formatting and hooks | treefmt and prek |

Use `mise run setup`, `mise run fmt`, `mise run typecheck`, `mise run test`, and
`mise run check` for repository work. Never use npm. Do not add runtime Python
packages for the web helper; the root mypy/mdformat packages are development
only. Pi peer packages provide types and must not be bundled. When intentionally
refreshing Python dependencies, keep public resolution explicit with
`UV_DEFAULT_INDEX=https://pypi.org/simple uv lock --python 3.14.7`, then inspect
the lock before committing it.

First-time repository setup is:

```bash
mise trust
mise install
direnv allow
mise run setup
```

## Project structure

```text
extensions/
  <name>/
    index.ts
skills/
  <name>/
    SKILL.md
    scripts/
agent-toolkit.json
scripts/
  agent-toolkit.ts
```

Every extension has a default-exported `ExtensionAPI` factory. Every skill has
valid Agent Skills frontmatter with a lowercase hyphenated `name` matching its
directory and a concise actionable `description`.

When adding, removing, or renaming a skill, update `agent-toolkit.json`, README
inventory, and installer tests in the same change. Scope is explicit; never
infer portability from a skill's contents.

## Installer safety

Keep installer behavior aligned with its ownership-safe design:

- destinations are exactly `~/.pi/agent/skills`, `~/.prime/agent/skills`,
  `~/.codex/skills`, and `~/.claude/skills`;
- install and status consider only the selected agent's configured skills;
- sync/uninstall remove only direct skill links targeting this checkout's
  `skills/` directory;
- preserve unmanaged files/directories, external and moved-checkout links,
  built-ins, and separately managed resources;
- conflicts are nonzero and never replaced;
- dry-run must not create roots or mutate anything;
- config/frontmatter validation happens before mutation.

Add focused Bun tests for every ownership or scope change. Tests must use
temporary homes, never real harness directories.

## Python web helper

`skills/web/scripts/web` must remain an executable uv-script CLI pinned with
`requires-python = "==3.14.7"`, using the standard library plus external `gh`
and `html2markdown` only on their applicable paths. Invoke it directly; do not
select an ambient `python3`.

- Use `urllib` with explicit timeouts and HTTP(S)-only validation.
- Use `subprocess` with an argv list, stdin data, timeouts, and no shell.
- Keep external-command execution POSIX-only until a Windows Job Object
  implementation can provide equivalent bounded process-tree cleanup.
- Bound displayed output and error details; save complete output to a temporary
  file when truncated.
- Keep search/fetch offline-unit-testable by mocking network and subprocess
  boundaries.
- Maintain two distinct ordinary-page requests: Markdown-for-Agents first, then
  static HTML for `html2markdown`.
- Recognized GitHub URLs use `gh api` and do not silently fall back to HTML.
- Treat explicit user consent as an instruction, not a claim of technical
  enforcement.
- Do not add package dependencies, interactive-page machinery, or Pi extension
  APIs.

Python tests live beside the helper as `*_test.py` and use `unittest`.

## Extension conventions

- Use `node:` imports for built-ins and strict TypeScript without `any`.
- Return `{ content, details }` from tools and name tools explicitly in prompt
  guidance.
- Use narrow event handlers, `ctx.signal` for abort-aware work, and cleanup on
  shutdown.
- Check `ctx.hasUI`, confirm destructive actions, and surface handler-boundary
  errors without crashing Pi.
- Test TypeScript utilities with co-located `*.test.ts` files.

## Skills and delegation

Use relative helper paths and include prerequisites and concrete examples. Keep
Pi-specific skills scoped only to Pi.

When delegating work, follow `skills/subagent/SKILL.md`: prefer serial, bounded
children, choose the smallest appropriate tier, and report failures instead of
duplicating the child's task.

## Required checks

Run the checks relevant to the change, and for cross-cutting installer/web
changes run:

```bash
mise run check
git diff --check
```

Use the narrower `mise run fmt`, `mise run typecheck`,
`mise run skills:validate`, and `mise run test` tasks while iterating.
`mise run setup` installs only the Bun and uv lockfiles.
`mise run hooks:install` is an explicit, separate mutation and must not be
folded into setup or checks.

Do not use live Pi sessions or real harness homes for automated checks.

## Git hygiene

Keep changes focused, do not commit secrets, and do not commit unless asked.
Report changed files, tests run, skipped checks, warnings, and remaining
uncertainty.
