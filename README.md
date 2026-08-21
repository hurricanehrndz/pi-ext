# agent-toolkit

A one-stop shop for [pi.dev](https://pi.dev) extensions and portable Agent
Skills, built with [Bun](https://bun.sh).

## Resources and ownership

| Resource | Delivery | Scope |
| -- | -- | -- |
| `extensions/` | The `agent-toolkit` Pi package (`package.json` → `pi.extensions`) | Pi only |
| `skills/` | Symlinks managed only by `scripts/agent-toolkit.ts`; optional `agent-toolkit.json` overrides the default scope | All four agents by default, with per-skill exceptions |
| `prompts/` | Not delivered by the current package manifest or installer | Manual/separate decision |

The package and installer deliberately do not both own Pi skill installation.

### Extensions

| Name | Description |
| -- | -- |
| [custom-footer](extensions/custom-footer/index.ts) | Compact footer with path, branch, context usage, cost, model, and thinking level |
| [protected-paths](extensions/protected-paths/index.ts) | Prevents overwrite of an existing `.env` through Pi's write/edit tools |
| [system-prompt](extensions/system-prompt/index.ts) | Shows the current Pi system prompt and tool list |

### Skills

| Name | Harnesses | Description |
| -- | -- | -- |
| [obsidian-cli](skills/obsidian-cli/SKILL.md) | Pi, Prime, Codex, Claude | Reads, searches, and safely edits the primary Obsidian vault |
| [subagent](skills/subagent/SKILL.md) | Pi | Spawns an isolated Pi process for delegated work |
| [web](skills/web/SKILL.md) | Pi, Prime, Codex, Claude | Explicit-consent static web search and URL-to-Markdown extraction |

Every discovered skill defaults to all four agents. The optional
`agent-toolkit.json` contains only exceptions; here it narrows `subagent` to Pi.
Unlisted skills keep the all-agent default.

### Prompt

`prompts/review.md` is retained as a reusable review prompt, but remains
intentionally absent from package and installer delivery.

## Prerequisites

- [mise](https://mise.jdx.dev) and [direnv](https://direnv.net) for the pinned
  development environment.
- [uv](https://docs.astral.sh/uv/) for the executable web helper, which is
  pinned to CPython 3.14.7 and otherwise uses only the standard library.
- [Bun](https://bun.sh) 1.3.13 for TypeScript tooling and the skill installer
  (installed by mise for development).
- [Pi](https://pi.dev), when using the Pi-only extensions or `subagent` skill.
- `obsidian`, when using `obsidian-cli`.
- `gh`, when the web skill reads recognized GitHub URLs.
- `html2markdown`, only for the web skill's ordinary static-HTML conversion
  path.
- A POSIX host (macOS or Linux) for direct `./scripts/web` execution and the
  bounded `gh` and `html2markdown` subprocess paths. On Windows, HTTP-only
  search and Markdown-for-Agents extraction can be invoked explicitly with
  `uv run --script scripts\web`.

## Install the Pi extensions

Install the package from Git or point Pi at a local checkout:

```bash
pi install git:github.com/hurricanehrndz/agent-toolkit
# or, from a clone:
pi add /path/to/agent-toolkit
```

Only `extensions/` is declared in the Pi package manifest. Skills are installed
separately so that their cross-agent scope has one owner.

For one-off extension development, use `pi -e ./extensions/<name>/index.ts` and
`/reload` after edits.

## Install and manage skills

Clone the repository, approve its local tool configuration, and install the
locked dependencies:

```bash
git clone https://github.com/hurricanehrndz/agent-toolkit
cd agent-toolkit
mise trust
mise install
direnv allow
mise run setup
mise run skills:validate
mise run skills:install -- --dry-run
mise run skills:install
```

The package also exposes the same CLI as the `agent-toolkit` bin. Commands
default to all four agents. Every discovered skill is in all four effective
scopes unless the optional config overrides that skill:

- Pi: `~/.pi/agent/skills`
- Prime: `~/.prime/agent/skills`
- Codex: `~/.codex/skills`
- Claude: `~/.claude/skills`

Select one or more harnesses with repeatable `--agent` flags or a
comma-separated value:

```bash
mise run skills:install -- --agent pi,codex
mise run skills:status -- --agent prime
mise run skills:sync -- --agent all --dry-run
mise run skills:sync
mise run skills:uninstall -- --agent claude
```

The executable remains the equivalent interface when mise is unavailable:
`./scripts/agent-toolkit.ts <command> [options]`.

- `install` adds missing scoped links and reports existing destinations as
  conflicts.
- `sync` also removes stale links owned by this checkout, including links made
  stale by a scope change.
- `status` reports linked, missing, and conflicting scoped skills without
  mutation.
- `uninstall` removes only skill links owned by this checkout.
- `validate` strictly checks every skill's frontmatter and, when present, the
  optional scope-override config.
- `--dry-run` previews changes without creating destination roots or mutating
  files.
- `--home <path>` overrides the home directory, primarily for tests.

Unmanaged files/directories, external links, links from a moved checkout, and
separately managed resources are preserved. A conflict produces a nonzero exit
rather than replacing content.

## Web skill

From `skills/web/`, after the user has explicitly requested web access or URL
reading:

```bash
./scripts/web search --query "current project documentation"
./scripts/web fetch https://example.com/docs
./scripts/web fetch https://example.com/docs --include-selector main --exclude-selector nav
```

Search defaults to `https://search.hrndz.ca`; set `WEB_SEARCH_BASE_URL` or pass
`--base-url` to change it. See [the skill instructions](skills/web/SKILL.md) for
consent, GitHub handling, prerequisites, and static-extraction limitations.

## Development

Use the repository's mise tasks rather than selecting runtimes directly:

```bash
mise run fmt              # Format repository-authored root and skill Markdown
mise run typecheck        # Type-check Python and TypeScript
mise run skills:validate  # Validate skill metadata and optional scope overrides
mise run test             # Run the Python and Bun suites
mise run check            # Run the complete repository gate
mise run hooks:install    # Explicitly install pre-commit hooks
```

Pi loads extensions from TypeScript source, so type checking is the build check.
The root peer dependencies provide Pi API types without bundling Pi itself. The
web helper remains standard-library-only at runtime; its root Python packages
are development-only type-checking and formatting tools.

Portable Python helpers are direct uv-script entry points pinned to CPython
3.14.7. Invoke `./skills/web/scripts/web` directly, including through an
installed skill symlink, rather than selecting an ambient `python3`. uv may
download the exact interpreter when it is not already installed; set
`UV_PYTHON_DOWNLOADS=never` when fail-closed offline behavior is required.

### Add an extension

Create `extensions/<name>/index.ts` with a default `ExtensionAPI` factory, add
extension-specific dependencies only when needed, test it, and list it above.
Extensions remain Pi-only package resources.

### Add or change a skill

1. Create `skills/<name>/SKILL.md` with Agent Skills frontmatter whose `name`
   matches the directory.
1. Put helpers under `skills/<name>/scripts/` and use relative invocations in
   the skill documentation.
1. Leave an all-agent skill out of `agent-toolkit.json`. Add an override only
   when its scope differs from the default.
1. Add focused offline tests for helpers and installer behavior.
1. Run `mise run check`.

## Tech stack

| Tool | Role |
| -- | -- |
| Bun | Installer runtime, package manager, TypeScript test runner |
| TypeScript | Pi extensions and the installer |
| Python standard library | Portable web helper |
| Agent Skills | Cross-harness skill format |

## License

MIT
