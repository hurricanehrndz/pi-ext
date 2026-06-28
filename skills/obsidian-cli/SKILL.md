---
name: obsidian-cli
description: Read, search, analyze, and safely edit the primary Obsidian vault at ~/zet using the obsidian CLI. Use when users ask to inspect notes, backlinks, tags, tasks, daily notes, bases, or make targeted vault changes.
---

# Obsidian CLI

Use this skill to work with the primary Obsidian vault using the `obsidian` CLI and, when necessary, direct file reads/edits inside the vault.

## Defaults

- Primary vault name: `zet`
- Primary vault path: `~/zet` (`/Users/chernand/zet`)
- Prefer `vault=zet` on all `obsidian` commands so results do not depend on the active vault.
- Obsidian CLI arguments use `key=value` syntax, not GNU-style flags.
- `path=` is an exact vault-relative path, for example `path="10_Notes/example.md"`.
- `file=` resolves by note name like a wikilink and can be ambiguous; prefer `path=` for writes.

## Ground rules

- Treat the vault as read-only unless the user explicitly asks to change notes.
- Get explicit confirmation before destructive operations: `delete`, `permanent`, `overwrite`, `move`, `rename`, `history:restore`, `sync:restore`, plugin/theme changes, or sync state changes.
- For precise edits to existing notes, resolve the vault-relative path first, read the current file, then use the normal `edit` tool on `~/zet/<path>` with minimal replacements. This is safer than reconstructing whole notes through shell quoting.
- Use `obsidian append`, `obsidian prepend`, `daily:append`, or `daily:prepend` only for simple additions where appending/prepending is exactly what the user asked for.
- Do not browse unrelated private notes. Search narrowly, read only relevant files, and summarize without dumping large note contents unless requested.
- Preserve Markdown, YAML frontmatter, wikilinks, tags, block IDs, task markers, and existing formatting unless the requested change requires otherwise.

## Quick checks

Confirm the CLI and vault when needed:

```bash
command -v obsidian
obsidian vaults verbose
obsidian vault vault=zet
obsidian vault vault=zet info=path
```

## Common read-only commands

### List files and folders

```bash
obsidian files vault=zet ext=md
obsidian files vault=zet folder="10_Notes" ext=md
obsidian folders vault=zet
obsidian folder vault=zet path="10_Notes" info=files
```

### Search notes

Use context search first when the user asks to find notes about a topic:

```bash
obsidian search:context vault=zet query="search terms" limit=20
obsidian search:context vault=zet query="search terms" path="40_Projects" limit=20
obsidian search vault=zet query="#tag" limit=50 format=json
```

For deterministic filename/path searches or complex regex, direct filesystem search in `~/zet` is fine:

```bash
rg -n --glob '*.md' 'search terms' ~/zet
find ~/zet -name '*.md' | sort
```

### Read a note

Prefer exact `path=` once known:

```bash
obsidian read vault=zet path="10_Notes/example.md"
obsidian file vault=zet path="10_Notes/example.md"
obsidian outline vault=zet path="10_Notes/example.md" format=md
obsidian wordcount vault=zet path="10_Notes/example.md"
```

If output may be large, use the normal `read` tool on `~/zet/<path>` after resolving the path.

### Link graph and note structure

```bash
obsidian backlinks vault=zet path="10_Notes/example.md" counts
obsidian links vault=zet path="10_Notes/example.md"
obsidian unresolved vault=zet counts verbose
obsidian orphans vault=zet all
obsidian deadends vault=zet all
obsidian aliases vault=zet verbose
```

### Tags and tasks

```bash
obsidian tags vault=zet counts sort=count
obsidian tag vault=zet name="#project" verbose
obsidian tasks vault=zet todo verbose
obsidian tasks vault=zet path="90_Tasks" todo verbose
obsidian task vault=zet ref="90_Tasks/tasks.md:42" done
```

Only update tasks when the user explicitly asks. Prefer task `ref=<path:line>` when toggling or marking done/todo.

### Daily notes

```bash
obsidian daily:path vault=zet
obsidian daily:read vault=zet
obsidian daily:append vault=zet content="- Note text"
obsidian daily:prepend vault=zet content="# Heading\n"
```

### Bases

```bash
obsidian bases vault=zet
obsidian base:views vault=zet path="path/to/base.base"
obsidian base:query vault=zet path="path/to/base.base" view="View name" format=md
```

## Editing workflows

### Modify existing content

1. Resolve the note path with `obsidian search:context`, `obsidian files`, or `obsidian file`.
2. Read the current note from `~/zet/<path>`.
3. Make the smallest targeted change with the `edit` tool.
4. Verify with `obsidian read`, `obsidian outline`, `obsidian backlinks`, or `rg` as appropriate.

### Create a note

Use `obsidian create` when creating a new note through Obsidian is useful:

```bash
obsidian create vault=zet path="00_Inbox/new-note.md" content="# New Note\n\nInitial text" open
```

Before using `overwrite`, confirm with the user. For longer note bodies, write the file directly under `~/zet` with the normal `write` tool after confirming the intended path.

### Append or prepend

```bash
obsidian append vault=zet path="10_Notes/example.md" content="\n## New section\n\nText"
obsidian prepend vault=zet path="10_Notes/example.md" content="Prepended text\n"
```

Shell quoting is fragile for long or multiline content. For substantial edits, prefer direct `edit`/`write` on `~/zet/<path>`.

### Move, rename, or delete

These are high-impact vault operations. Ask for explicit confirmation first, then use exact paths:

```bash
obsidian move vault=zet path="old/path.md" to="new/path.md"
obsidian rename vault=zet path="old/path.md" name="New Name"
obsidian delete vault=zet path="old/path.md"
```

Never use `permanent` unless the user explicitly requests permanent deletion after being warned.

## Answering guidance

- Cite note paths for anything read from the vault.
- When summarizing search results, group by note and include the matching line context when useful.
- If a note name is ambiguous, present candidate paths and ask which one to use before editing.
- For requested changes, report exactly which vault paths changed and how you verified them.

## Maintenance

This skill lives in the `pi-ext` repo at `skills/obsidian-cli/`. If you find a bug while using it, fix it and commit the change to the repo first, before relying on the skill further.
