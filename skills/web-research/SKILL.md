---
name: web-research
description: Searches the web and extracts user-requested URLs through SearXNG, GitHub CLI, html2markdown, and a headless agent-browser when the user explicitly asks for web research or URL reading.
---

# Web Research

Use this skill when the user explicitly asks for web search, current external information, or URL reading/extraction.

## When to Use

- The user explicitly asks to search the web.
- The user asks for current external information that is not available from local files or provided context.
- The user provides a URL and asks to read, summarize, inspect, or extract it.

## When Not to Use

- Local repository files, loaded context, or user-provided material are sufficient.
- The user did not request web access.
- The task would require speculative browsing or broad crawling.

## Tools

- `internet_search` searches the public web through SearXNG. Use it only when the user explicitly asks for web search, current web information, or finding external web pages.
- `web_fetch_markdown` fetches a user-requested URL and converts it to Markdown through GitHub CLI, Cloudflare Markdown-for-Agents, `html2markdown`, or headless agent-browser rendering.

When calling either tool, set `userRequestReason` to the explicit user request that authorized web access. Do not invent a rationale or browse speculatively.

## GitHub Links

Use `web_fetch_markdown` for GitHub repository, PR, issue, blob, tree, and raw file links. Recognized GitHub links route through `gh`/`gh api` instead of generic HTML extraction.

If `gh` authentication fails or rate limits block the request, ask the user to run `gh auth login` or otherwise resolve GitHub CLI authentication before retrying.

## Browser Login Setup

Some sites require authentication before agent-browser rendering can extract useful content. Use the dedicated agent-browser profile, not a personal/default Chrome profile. agent-browser drives a headless Chrome for Testing, so it does not add a Dock icon or hijack your normal browser's links.

```bash
agent-browser --session pi-web --profile ~/.cache/pi-ext/web-research/browser-profile --headed open https://example.com
```

Replace `https://example.com` with the site requiring login, then log in interactively in the opened browser. Future `web_fetch_markdown` browser fallback runs reuse that dedicated profile.

## Usage

Web search request:

```text
Use web search to find the current html2markdown CLI docs for include-selector and summarize the top results.
```

URL extraction request:

```text
Read https://example.com/docs and summarize the relevant setup instructions.
```

JS-heavy page/browser render request:

```text
Read this JS-heavy page using browser rendering: https://example.com/app
```

GitHub PR/issue/blob request:

```text
Read https://github.com/cli/cli/pull/123 with the web URL extraction tool and summarize the PR.
```

```text
Read https://github.com/cli/cli/issues/456 and summarize the issue discussion.
```

```text
Read https://github.com/cli/cli/blob/trunk/README.md and summarize the file.
```

## Maintenance

This skill lives in the `pi-ext` repo at `skills/web-research/`. If you find a bug while using it, fix it and commit the change to the repo first, before relying on the skill further.
