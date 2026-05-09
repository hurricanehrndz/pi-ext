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
# Install globally — all extensions, skills, and themes auto-discovered on every pi startup
pi install git:github.com/hurricanehrndz/pi-ext

# Try without installing (current run only)
pi -e git:github.com/hurricanehrndz/pi-ext
```

After installing, activate a theme via `/settings` or `~/.pi/agent/settings.json`:

```json
{ "theme": "catppuccin-latte" }
```

Other available themes: `rose-pine`.

Install repo prompts and collaborative agent guidance with `/install-my-prompts` to symlink `prompts/*.md` into `~/.pi/agent/prompts` and `extensions/install-my-prompts/append-system.md` into `~/.pi/agent/APPEND_SYSTEM.md`.

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
```

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

## Prompts

| Name | Description |
|------|-------------|
| [review](prompts/review.md) | Reviews the current branch diff against the repository base branch with read-only `git diff` / `git log` / `git show` inspection |

## Themes

| Name | Description |
|------|-------------|
| [rose-pine](themes/rose-pine.json) | Rosé Pine — soho vibes, muted base with rose, foam, iris, and gold accents |
| [catppuccin-latte](themes/catppuccin-latte.json) | Catppuccin Latte — warm light theme with pastel mauve, blue, teal, and peach accents |

## Extensions

| Name | Description |
|------|-------------|
| [custom-footer](extensions/custom-footer/index.ts) | Compact single-line footer: path + git branch, context usage, model and thinking level |
| [permission-gate](extensions/permission-gate/index.ts) | Prompts for confirmation before running dangerous bash commands (`rm -rf`, `sudo`, `chmod/chown 777`) |
| [protected-paths](extensions/protected-paths/index.ts) | Blocks `write` and `edit` tool calls to sensitive paths (`.env`, `.git/`, `node_modules/`) |
| [persona](extensions/persona/index.ts) | Dynamically overrides the agent persona via `/persona <description>` — cleared with `/persona off` |
| [install-my-prompts](extensions/install-my-prompts/index.ts) | Symlinks the repo's `prompts/*.md` files and collaborative `APPEND_SYSTEM.md` guidance into `~/.pi/agent` |
| [system-prompt](extensions/system-prompt/index.ts) | Shows the current system prompt and tool list via `/system-prompt` |

## Creating a new extension

1. Create `extensions/<name>/index.ts`:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
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
| [@mariozechner/pi-coding-agent](https://pi.dev) | Extension & skill APIs |

## License

MIT
