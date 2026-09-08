---
"@idevconn/create-icore": patch
---

CI: bump `changesets/action` from the floating `v1` tag to a pinned `v2.1.2` commit in `.github/workflows/release.yml`. `v1` only supports `@changesets/cli` v2 (per the action's own README); this repo bumped `@changesets/cli` to `^3.0.1` in the same release that first regressed (0.14.0), and `v1`'s tag-push path silently stopped pushing git tags/GitHub Releases for every release since (0.14.0 through 0.15.0 all published to npm correctly, but got no tag or release — recovered manually). `v2` also defaults to pushing via the GitHub API instead of a local git push, the more likely actual fix. Renamed the action's `publish`/`version` inputs to `publish-script`/`version-script` and `outputs.hasChangesets` to `outputs.has-changesets` to match v2's renamed API.
