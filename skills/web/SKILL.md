---
name: web
description: Use when the user explicitly asks for web search, current external information, or reading a URL. Searches through SearXNG and fetches static Markdown through GitHub CLI, Cloudflare Markdown-for-Agents, or HTML converted by html2markdown.
---

# Web

Use this skill only when the user's request explicitly requires web access.

## When to Use

- The user explicitly asks to search the web or find current external information.
- The user provides a URL and asks to read, summarize, inspect, or extract it.

Do not use web tools when local files, provided context, or repository search are sufficient. Do not browse speculatively or turn a focused request into broad crawling.

## Tools

- `web_search` searches the public web through SearXNG.
- `web_fetch` reads a user-requested URL as Markdown. Recognized GitHub repository, pull request, issue, blob, tree, and raw-file URLs route through `gh`; other URLs try Cloudflare Markdown-for-Agents and then static HTML converted with `html2markdown`.

When calling either tool, set `userRequestReason` to the explicit user request that authorized web access. Do not invent a rationale.

`web_fetch` accepts optional `includeSelector` and `excludeSelector` CSS selectors for narrowing ordinary HTML conversion. These selectors do not change the GitHub or Cloudflare paths.

## GitHub Links

Use `web_fetch` for recognized GitHub links instead of fetching their generic HTML pages. If GitHub authentication or rate limiting blocks `gh`, ask the user to run `gh auth login` or otherwise resolve the limit before retrying.

## Usage

Web search request:

```text
Use web search to find the current html2markdown CLI docs for include-selector and summarize the top results.
```

URL extraction request:

```text
Read https://example.com/docs and summarize the relevant setup instructions.
```

GitHub request:

```text
Read https://github.com/cli/cli/pull/123 and summarize the pull request.
```

## Limitations

URL extraction is static. If a page exposes no useful content without client-side execution or requires an interactive login, explain the limitation rather than attempting another access method.

## Maintenance

This skill lives in the `pi-ext` repo at `skills/web/`. If you find a bug while using it, fix it in that repository before relying on the skill further.
