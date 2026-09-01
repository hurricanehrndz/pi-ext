---
name: osquery-dev
description: Use when writing, testing, debugging, or verifying osquery SQL queries.
---

# osquery dev

Develop against the same runtime the query ships to, verify piece by piece, and
never read an empty result as a broken join before probing.

## Run the query

```bash
osqueryi -json "SELECT ..."          # exits after the result
osqueryd -S -json "SELECT ..."       # osqueryd needs -S to act as osqueryi
```

Without `-S`, `osqueryd` stays resident and the call hangs until timeout.
Writable `--logger_path`, `--config_path`, and `--extensions_socket` are
required; a missing one exits 78. When the binary is Orbit's:

```text
/opt/orbit/bin/osqueryd/macos-app/stable/osquery.app/Contents/MacOS/osqueryd
```

pass its flags after `--`.

Fleet runs osqueryd as root. Test with `sudo` when you can; otherwise expect
zero rows from root-only paths and read that as a privilege artifact, not a
broken join.

## Empty result != broken query

Decompose the query into one labeled probe per table and run them as separate
statements first. The first empty probe is the answer; the joined query is only
rerun after every probe returns.

```sql
SELECT 'users' AS src, username, uid, directory FROM users WHERE uid >= 501;
SELECT 'file' AS src, path, size, mtime FROM file WHERE path LIKE '/Users/%/...';
SELECT 'apps' AS src, bundle_identifier, last_opened_time
  FROM apps WHERE bundle_identifier = '...';
```

Then mirror each probe in the joined query — JOIN order, LEFT JOINs, and WHERE
clauses that restate probe filters.

## Table traps

- `apps` sees bundles outside standard app dirs, but a launchd-execed bundle
  reports `last_opened_time = -1.0`: EXISTS only, never join on it.
- `processes.start_time` is unix time on macOS but seconds-since-boot on Linux —
  normalize before `datetime()` when a query must run on both.
- `pkg_receipts` does not exist on macOS builds: install time comes from
  `file.mtime` on the bundle, which moves on every update, so read it as
  latest-install, never first-install.
- `users` wraps negative uids to `4294967294` (`nobody`, `/var/empty`), and
  those rows pass `uid >= 501` — filter on `directory LIKE '/Users/%'` too.
- `plist` emits one row per matching path; `IN (...)` across several paths is
  valid, and a missing path just returns no rows.
- Fractional epochs return as strings (`"1788276135.21331"`):
  `CAST(col AS INTEGER)` before mtime arithmetic, `ABS(a - b)` for freshness
  deltas.
- Scalar subqueries with `CASE WHEN EXISTS` stay uncorrelated and evaluate once;
  correlated ones re-run per row.

## Ship it

A query is verified when every probe returns, the joined query returns, and each
threshold heuristic (staleness windows, size floors) cites its observed cadence
or measurement rather than a guess.
