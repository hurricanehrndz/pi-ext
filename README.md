# pi-ext

A one-stop shop for [pi.dev](https://pi.dev) extensions and portable Agent Skills, built with [Bun](https://bun.sh).

## Resources and ownership

| Resource | Delivery | Scope |
|---|---|---|
| `extensions/` | The `pi-ext` Pi package (`package.json` → `pi.extensions`) | Pi only |
| `skills/` | Symlinks managed only by `scripts/agent-toolkit.ts` according to `agent-toolkit.json` | Per skill and harness |
| `prompts/` | Not delivered by the current package manifest or installer | Manual/separate decision |

The package and installer deliberately do not both own Pi skill installation.

### Extensions

| Name | Description |
|---|---|
| [custom-footer](extensions/custom-footer/index.ts) | Compact footer with path, branch, context usage, cost, model, and thinking level |
| [protected-paths](extensions/protected-paths/index.ts) | Prevents overwrite of an existing `.env` through Pi's write/edit tools |
| [system-prompt](extensions/system-prompt/index.ts) | Shows the current Pi system prompt and tool list |

### Skills

| Name | Harnesses | Description |
|---|---|---|
| [obsidian-cli](skills/obsidian-cli/SKILL.md) | Pi, Prime, Codex, Claude | Reads, searches, and safely edits the primary Obsidian vault |
| [subagent](skills/subagent/SKILL.md) | Pi | Spawns an isolated Pi process for delegated work |
| [web](skills/web/SKILL.md) | Pi, Prime, Codex, Claude | Explicit-consent static web search and URL-to-Markdown extraction |

`agent-toolkit.json` is the source of truth for this scope. Every discovered skill must be listed there explicitly.

### Prompt

`prompts/review.md` is retained as a reusable review prompt, but remains intentionally absent from package and installer delivery.

## Prerequisites

- [Bun](https://bun.sh) 1.3 or newer, for TypeScript tooling and the skill installer.
- Python 3.11 or newer, for `skills/web/scripts/web` (standard library only).
- [Pi](https://pi.dev), when using the Pi-only extensions or `subagent` skill.
- `obsidian`, when using `obsidian-cli`.
- `gh`, when the web skill reads recognized GitHub URLs.
- `html2markdown`, only for the web skill's ordinary static-HTML conversion path.
- macOS or Linux for the web helper's bounded `gh` and `html2markdown` subprocess paths.

## Install the Pi extensions

Install the package from Git or point Pi at a local checkout:

```bash
pi install git:github.com/hurricanehrndz/pi-ext
# or, from a clone:
pi add /path/to/pi-ext
```

Only `extensions/` is declared in the Pi package manifest. Skills are installed separately so that their cross-agent scope has one owner.

For one-off extension development, use `pi -e ./extensions/<name>/index.ts` and `/reload` after edits.

## Install and manage skills

Clone the repository, install its existing development dependencies, then run the installer from the checkout:

```bash
git clone https://github.com/hurricanehrndz/pi-ext
cd pi-ext
bun install
bun ./scripts/agent-toolkit.ts validate
bun ./scripts/agent-toolkit.ts install
```

The package also exposes the same CLI as the `agent-toolkit` bin. Commands default to all four harnesses, while each harness receives only skills scoped to it:

- Pi: `~/.pi/agent/skills`
- Prime: `~/.prime/agent/skills`
- Codex: `~/.codex/skills`
- Claude: `~/.claude/skills`

Select one or more harnesses with repeatable `--agent` flags or a comma-separated value:

```bash
bun ./scripts/agent-toolkit.ts install --agent pi,codex
bun ./scripts/agent-toolkit.ts status --agent prime
bun ./scripts/agent-toolkit.ts sync --agent all --dry-run
bun ./scripts/agent-toolkit.ts sync
bun ./scripts/agent-toolkit.ts uninstall --agent claude
```

- `install` adds missing scoped links and reports existing destinations as conflicts.
- `sync` also removes stale links owned by this checkout, including links made stale by a scope change.
- `status` reports linked, missing, and conflicting scoped skills without mutation.
- `uninstall` removes only skill links owned by this checkout.
- `validate` strictly checks the config inventory and every skill's frontmatter.
- `--dry-run` previews changes without creating destination roots or mutating files.
- `--home <path>` overrides the home directory, primarily for tests.

Unmanaged files/directories, external links, links from a moved checkout, and separately managed resources are preserved. A conflict produces a nonzero exit rather than replacing content.

## Web skill

From `skills/web/`, after the user has explicitly requested web access or URL reading:

```bash
./scripts/web search --query "current project documentation"
./scripts/web fetch https://example.com/docs
./scripts/web fetch https://example.com/docs --include-selector main --exclude-selector nav
```

Search defaults to `https://search.hrndz.ca`; set `WEB_SEARCH_BASE_URL` or pass `--base-url` to change it. See [the skill instructions](skills/web/SKILL.md) for consent, GitHub handling, prerequisites, and static-extraction limitations.

## Development

```bash
bun install
bun test
bunx tsc --noEmit
python3 -m unittest discover -s skills/web/scripts -p '*_test.py'
bun ./scripts/agent-toolkit.ts validate
git diff --check
```

Pi loads extensions from TypeScript source, so type checking is the build check. The root peer dependencies provide Pi API types without bundling Pi itself. Do not install Python packages for the web helper; keep it standard-library-first and mock network/subprocess behavior in offline unit tests.

### Add an extension

Create `extensions/<name>/index.ts` with a default `ExtensionAPI` factory, add extension-specific dependencies only when needed, test it, and list it above. Extensions remain Pi-only package resources.

### Add or change a skill

1. Create `skills/<name>/SKILL.md` with Agent Skills frontmatter whose `name` matches the directory.
2. Put helpers under `skills/<name>/scripts/` and use relative invocations in the skill documentation.
3. Add the skill and its complete harness scope to `agent-toolkit.json`; unconfigured skills are invalid.
4. Add focused offline tests for helpers and installer behavior.
5. Run the development checks above.

## Tech stack

| Tool | Role |
|---|---|
| Bun | Installer runtime, package manager, TypeScript test runner |
| TypeScript | Pi extensions and the installer |
| Python standard library | Portable web helper |
| Agent Skills | Cross-harness skill format |

## License

MIT
