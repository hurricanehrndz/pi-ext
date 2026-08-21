---
name: pi-docs
description: Locates and navigates pi's own reference documentation, source, and bundled examples. Use when answering questions about pi itself or writing anything that targets its APIs — extensions, custom tools, skills, prompt templates, themes, keybindings, TUI components, the SDK, RPC mode, custom providers, models, settings, or sessions.
---

# Pi Reference Docs

Pi ships its own `README.md`, `docs/`, and `examples/` inside the installed package. Read them
before answering questions about pi or writing code against its APIs — do not answer from memory,
since the API surface moves between releases.

## Finding the docs

If `PI_PACKAGE_DIR` points to the package used by the running pi, inspect it directly:

```bash
ls "$PI_PACKAGE_DIR/docs"
```

Otherwise, resolve the installed package from the current project:

```bash
bun -e 'console.log(Bun.fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")))'
```

Take the directory two levels up from that path (`…/dist/index.js` → package root). Under Nix the
package root is the `libexec/pi` directory inside pi's store path, and this may resolve to a
*different* copy than the running binary — check `pi --version` against `$PI_PACKAGE_DIR/package.json`
if an API appears to be missing.

## Navigating

- Start at `docs/index.md` — it is the table of contents and stays current, unlike any list copied
  into a prompt.
- `docs/extensions.md` (~115 KB), `docs/rpc.md`, `docs/sdk.md`, and `docs/tui.md` are far too large
  to read whole. Grep for the symbol or event name first, then read the surrounding section.
- Read smaller docs completely, and follow their cross-references — `extensions.md` routinely defers
  TUI details to `tui.md` and tool details to `sdk.md`.
- `examples/extensions/` holds ~60 working single-file extensions. For "how do I do X in an
  extension", grepping there is usually faster and more reliable than prose:

  ```bash
  grep -rl "registerCommand" "$PI_PACKAGE_DIR/examples/extensions" | head
  ```

## Where things are

| Topic | Doc |
|---|---|
| Extensions, events, custom tools | `docs/extensions.md` + `examples/extensions/` |
| SDK / embedding pi | `docs/sdk.md` + `examples/sdk/` |
| Skills | `docs/skills.md` |
| Prompt templates | `docs/prompt-templates.md` |
| Themes, keybindings, TUI | `docs/themes.md`, `docs/keybindings.md`, `docs/tui.md` |
| Packages (this repo's shape) | `docs/packages.md` |
| Providers, models, settings | `docs/providers.md`, `docs/models.md`, `docs/settings.md` |
| RPC / JSONL protocol | `docs/rpc.md` |
| Sessions, compaction | `docs/sessions.md`, `docs/session-format.md`, `docs/compaction.md` |

Anything not listed: check `docs/index.md` rather than guessing a filename.
