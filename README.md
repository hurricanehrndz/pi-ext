# pi-ext

A one-stop shop for [pi.dev](https://pi.dev) **extensions**, **skills**, and **prompts**, built with [Bun](https://bun.sh).

## What's in here

| Directory | Purpose |
|-----------|---------|
| `extensions/` | TypeScript extensions that extend pi's behavior (tools, commands, event hooks) |
| `skills/` | Agent skill packages following the [Agent Skills standard](https://agentskills.io/specification) |
| `prompts/` | Prompt templates you can symlink into `~/.pi/agent/prompts` |

## Repository layout

```
pi-ext/
├── extensions/          # pi extensions
│   └── <name>/
│       ├── index.ts     # Extension entry point (exports default function)
│       └── ...
├── skills/              # pi skills
│   └── <name>/
│       ├── SKILL.md     # Required: frontmatter + instructions
│       └── ...
├── prompts/             # reusable prompt templates
│   └── <name>.md
├── package.json         # Bun workspace / package manifest
├── README.md
└── AGENTS.md            # AI agent coding guidelines
```

## Install

```bash
# Install globally — all extensions and skills auto-discovered on every pi startup
pi install git:github.com/hurricanehrndz/pi-ext

# Try without installing (current run only)
pi -e git:github.com/hurricanehrndz/pi-ext
```

## Bootstrapping my config

To reproduce my personal pi setup on a fresh machine:

```bash
# 1. Clone this repo to the expected location
git clone https://github.com/hurricanehrndz/pi-ext ~/src/me/pi-ext
cd ~/src/me/pi-ext
bun install

# 2. Register the package with pi (auto-discovers all extensions + skills)
pi add ~/src/me/pi-ext
```

### Catppuccin theme

My config uses the [Catppuccin](https://github.com/otahontas/pi-coding-agent-catppuccin)
theme package, set to the `catppuccin-latte` flavor. Add it with:

```bash
pi add git:github.com/otahontas/pi-coding-agent-catppuccin
```

Then select the flavor in `~/.pi/agent/settings.json`:

```json
{
  "theme": "catppuccin-latte"
}
```

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.0
- [pi](https://pi.dev) installed globally

## Getting started

```bash
# Clone the repo
git clone https://github.com/hurricanehrndz/pi-ext
cd pi-ext

# Install dependencies
bun install

# Typecheck (this is the whole build — extensions are run from source by pi)
bunx tsc --noEmit
```

`bun install` pulls `@earendil-works/*` from npm purely for **types**. Nothing here is compiled or
bundled: pi loads `extensions/<name>/index.ts` from source at runtime, which is why those packages
stay in `peerDependencies`.

Iterate with `pi -e ./extensions/<name>/index.ts`, then `/reload` inside pi after each edit.

### Developing against a Nix-installed pi

On NixOS (or with Home Manager), `pi` on `$PATH` is a wrapper script, not the real binary:

```
/etc/profiles/per-user/<you>/bin/pi   →  /nix/store/<hash>-pi/bin/pi        (wrapper)
                                      →  /nix/store/<hash>-pi-<ver>/bin/pi  (real binary)
```

The npm package payload — `README.md`, `docs/`, `examples/` — sits in `libexec/pi` under that second
store path. Two consequences:

1. **`import.meta.resolve("@earendil-works/pi-coding-agent")` does not find it.** Resolution walks up
   from the extension's own directory, so it lands on `node_modules/` or Bun's global install cache —
   possibly a *different version* than the binary you are running. `extensions/prompt-customizer`
   therefore honours `PI_PACKAGE_DIR` first, and re-exports it so nested `pi` subagents and skill
   scripts inherit the same root.

2. **Store paths change on every upgrade.** Never hardcode one. Derive it in your shell init:

   ```bash
   export PI_PACKAGE_DIR="$(dirname "$(dirname "$(grep -om1 '/nix/store/[^ ]*/bin/pi' \
     "$(readlink -f "$(command -v pi)")")")")/libexec/pi"
   ```

   That greps the real binary path out of the wrapper, then walks to its `libexec/pi`. Verify with
   `ls "$PI_PACKAGE_DIR/docs"`.

The store is read-only, so treat `$PI_PACKAGE_DIR` as reference material only. When the npm types and
the running binary disagree, the binary wins — compare `pi --version` against
`$PI_PACKAGE_DIR/package.json` before chasing a "missing" API.

## Using extensions

### Load a single extension for a one-off run

```bash
pi -e ./extensions/my-extension/index.ts
```

### Install globally (auto-discovered on every pi startup)

Point pi at this repo in your global settings (`~/.pi/agent/settings.json`):

```json
{
  "extensions": [
    "/path/to/pi-ext/extensions/my-extension"
  ]
}
```

Or install the whole package at once via `pi install`:

```bash
pi install /path/to/pi-ext
```

### Install project-locally

Add to `.pi/settings.json` at the root of any project:

```json
{
  "extensions": [
    "../../pi-ext/extensions/my-extension"
  ]
}
```

Hot-reload after edits with `/reload` inside pi.

## Using skills

### Load for a one-off run

```bash
pi --skill ./skills/my-skill
```

### Install globally

Add to `~/.pi/agent/settings.json`:

```json
{
  "skills": [
    "/path/to/pi-ext/skills"
  ]
}
```

Or install via `pi install` (all skills are discovered automatically from `skills/`).

### Invoking a skill

Once loaded, skills appear as `/skill:<name>` commands inside pi:

```
/skill:my-skill
/skill:my-skill some argument
```

## Skills

| Name | Description |
|------|-------------|
| [commit](skills/commit/SKILL.md) | Creates Conventional Commits-style git commits from staged or specified changes |
| [obsidian-cli](skills/obsidian-cli/SKILL.md) | Reads, searches, and safely edits the Obsidian vault at `~/zet` via the `obsidian` CLI |
| [pi-docs](skills/pi-docs/SKILL.md) | Locates and navigates pi's own docs, source, and bundled examples when working against pi's APIs |
| [subagent](skills/subagent/SKILL.md) | Spawns an isolated pi process for edits, verification, reviews, research, or other delegated tasks |
| [web-research](skills/web-research/SKILL.md) | Searches the web and extracts URLs via SearXNG, `gh`, html2markdown, and a headless agent-browser |

## Prompts

| Name | Description |
|------|-------------|
| [review](prompts/review.md) | Reviews the current branch diff against the repository base branch with read-only `git diff` / `git log` / `git show` inspection |

## Extensions

| Name | Description |
|------|-------------|
| [custom-footer](extensions/custom-footer/index.ts) | Compact single-line footer: path + git branch, context usage, model and thinking level |
| [protected-paths](extensions/protected-paths/index.ts) | Blocks `write` and `edit` from overwriting an existing `.env` (creating one is allowed) |
| [system-prompt](extensions/system-prompt/index.ts) | Shows the current system prompt and tool list via `/system-prompt` |
| [prompt-customizer](extensions/prompt-customizer/index.ts) | Full control over the system prompt via `before_agent_start` — reproduces and exposes every default section for editing |

## Creating a new extension

1. Create `extensions/<name>/index.ts`:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("my-extension loaded!", "info");
  });

  pi.registerTool({
    name: "my_tool",
    label: "My Tool",
    description: "What this tool does",
    parameters: Type.Object({
      input: Type.String({ description: "Input text" }),
    }),
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      return {
        content: [{ type: "text", text: `Result: ${params.input}` }],
        details: {},
      };
    },
  });
}
```

2. Add a `package.json` if it needs npm dependencies:

```json
{
  "name": "my-extension",
  "dependencies": {
    "some-package": "^1.0.0"
  }
}
```

3. Run `bun install` in that directory.
4. Load with `pi -e ./extensions/my-extension/index.ts`.

## Creating a new skill

1. Create `skills/<name>/SKILL.md`:

```markdown
---
name: my-skill
description: What this skill does and when to use it. Be specific.
---

# My Skill

## Setup

```bash
cd /path/to/skills/my-skill && bun install
```

## Usage

```bash
bun run scripts/main.ts <input>
```
```

2. Add any helper scripts under `skills/<name>/scripts/`.
3. Validate the skill loads: `pi --skill ./skills/my-skill`.

## This repo as a pi package

`package.json` declares `pi-package` and points pi at the right directories:

```json
{
  "name": "pi-ext",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"]
  }
}
```

Install directly from git:

```bash
pi install git:github.com/hurricanehrndz/pi-ext
```

## Tech stack

| Tool | Role |
|------|------|
| [Bun](https://bun.sh) | Runtime, package manager, test runner |
| [TypeScript](https://www.typescriptlang.org) | Language for all extensions |
| [typebox](https://github.com/sinclairzx81/typebox) | JSON Schema / tool parameter types |
| [@earendil-works/pi-coding-agent](https://pi.dev) | Extension & skill APIs |

## License

MIT
