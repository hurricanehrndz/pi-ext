---
name: jira-project-info
description: Fetch Jira project, epic, issue, and sub-task information using the local jira-mcp CLI, with guarded Jira sub-task creation. Use when the user asks about Jira tickets, project or epic status, child issues under an epic, Jira issue context, cross-project Jira references, or creating a sub-task under a story. Epics may denote projects in this workspace.
---

# Jira Project Info

Use this skill when the user asks for Jira project, epic, or issue information across projects. In this workspace, **Jira epics may denote projects**, so project lookups should usually start with Epic issues.

## Ground rules

- Treat this as a **read-only** skill unless the user explicitly asks to modify Jira.
- Get explicit user confirmation before creating or modifying Jira issues.
- Prefer the helper script in this skill over direct `jira-mcp` calls for common project/epic lookups and sub-task creation.
- Do **not** use `jira-mcp -o markdown`; its Markdown output is known broken.
- Use `jira-mcp -o json` if calling `jira-mcp` directly.
- The Jira username should be resolved in this order:
  1. `$JIRA_USERNAME`
  2. `$USERNAME`
  3. `$USER`
- If the user refers to "my projects", search for active epics where that username is the assignee or reporter.
- When presenting results for notes, include Jira keys and links.
- If a Jira query returns too many results, summarize the top results and offer to narrow by project key, label, status, or text.

## Requirements

The environment should provide `uv`. The helper script uses a uv script shebang:

```bash
./scripts/jira-project-info --help
```

`jira-mcp` must also be available on `PATH` and authenticated/configured in the user's environment.

## Common commands

### List my active project epics

Use this first for broad "what projects am I working on?" questions:

```bash
./scripts/jira-project-info epics --max-results 25
```

Equivalent direct `jira-mcp` pattern:

```bash
jira-mcp ai-tools-jira-search-issues \
  --query "issuetype = Epic AND (assignee = \"${JIRA_USERNAME:-${USERNAME:-$USER}}\" OR reporter = \"${JIRA_USERNAME:-${USERNAME:-$USER}}\") AND statusCategory != Done ORDER BY updated DESC" \
  --max-results 25 \
  -o json
```

### Include closed/done project epics

```bash
./scripts/jira-project-info epics --include-done --max-results 50
```

### Search project epics by text

```bash
./scripts/jira-project-info epics --text "fleet" --max-results 25
```

### Search project epics by Jira project key or label

```bash
./scripts/jira-project-info epics --project-key CPE --max-results 25
./scripts/jira-project-info epics --label cpe_project --max-results 25
```

Use `--all-users` if the user wants all epics matching the filter, not just epics assigned to or reported by them:

```bash
./scripts/jira-project-info epics --project-key CPE --all-users --max-results 25
```

### Fetch one project epic and its child issues

Use this when the user names a Jira key or asks for project detail/status:

```bash
./scripts/jira-project-info epic CPE-13605 --max-results 50
```

By default this fetches child issues. Include closed/done child issues when useful for full project history:

```bash
./scripts/jira-project-info epic CPE-13605 --include-done --max-results 100
```

Fetch comments too when the user asks for recent discussion/context:

```bash
./scripts/jira-project-info epic CPE-13605 --comments --max-results 50
```

### Run arbitrary read-only JQL

```bash
./scripts/jira-project-info search 'project = CPE AND statusCategory != Done ORDER BY updated DESC' --max-results 25
```

### Prepare or create a Jira sub-task under a story

Use this when the user asks to create a sub-task under a parent story. First run without `--confirm` to show the JSON payload and verify the target parent, title, description, components, and assignee:

```bash
./scripts/jira-project-info create-subtask \
  --parent CPE-12345 \
  --summary "Concise sub-task title" \
  --description-file /tmp/subtask-description.md
```

The dry-run payload has this shape:

```json
{
  "project_key": "CPE",
  "summary": "Concise sub-task title",
  "issue_type": "Sub-task",
  "description": "Structured description",
  "components": [],
  "assignee": null,
  "additional_fields": {
    "parent": "CPE-12345"
  }
}
```

After explicit confirmation, re-run with `--confirm` to create the Jira sub-task:

```bash
./scripts/jira-project-info create-subtask \
  --parent CPE-12345 \
  --summary "Concise sub-task title" \
  --description-file /tmp/subtask-description.md \
  --component Backend \
  --assignee jsmith \
  --confirm
```

### List Jira projects

```bash
./scripts/jira-project-info projects
./scripts/jira-project-info projects --text "client platform"
```

## Direct jira-mcp reference

Available useful direct tools:

```bash
jira-mcp ai-tools-jira-get-projects -o json
jira-mcp ai-tools-jira-get-issue --issue-id CPE-13605 --include-changelog false -o json
jira-mcp ai-tools-jira-get-comments --issue-id CPE-13605 --include-changelog false -o json
jira-mcp ai-tools-jira-search-issues --query '<JQL>' --max-results 25 -o json
jira-mcp ai-tools-jira-get-remote-links --issue-id CPE-13605 -o json
jira-mcp ai-tools-jira-get-components --project-key CPE -o json
jira-mcp ai-tools-jira-create-issue --raw '<sub-task payload json>' -o json
```

Useful child-issue JQL patterns for epics/projects:

```jql
"Epic Link" = "CPE-13605" ORDER BY updated DESC
issueFunction in issuesInEpics("key = CPE-13605") ORDER BY updated DESC
parent = CPE-13605 ORDER BY updated DESC
```

The helper tries these patterns for child issue lookup and skips patterns rejected by Jira.

## Output guidance

When answering the user:

- Start with the project/epic key, summary, status, assignee, due date if present, and link.
- For project status summaries, group child issues by status/category where helpful.
- Call out recent updates based on the `updated` field.
- Keep raw JSON out of the final answer unless the user asks for it.
- Markdown tables are preferred for lists of epics/issues.
