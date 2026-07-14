# Task 2 Report: Fix webpack-cli --node-env Flag in Remaining Microservices

## Overview

Fixed webpack-cli v7.2.1 incompatibility in 5 remaining microservice project.json files by replacing the deprecated `args: ["--node-env=<VALUE>"]` pattern with the new `env: { NODE_ENV: "<VALUE>" }` pattern, aligning all microservices with the pattern already established in `apps/api/project.json` (commit d37b52b).

## Step 1: Confirm Current Break

**Command:** `yarn nx build auth`

**Exact Error Observed:**
```
[webpack-cli] [31m✖ Error: Unknown option '--node-env=production'[39m
[webpack-cli] [31m✖ Run 'webpack --help' to see available commands and options[39m
```

This confirms webpack-cli 7.2.1 (bumped in Task 1) has removed the `--node-env` CLI flag.

## Files Modified

All 5 microservices applied the identical fix pattern (2 locations per file):

1. **apps/microservices/auth/project.json**
2. **apps/microservices/notes/project.json**
3. **apps/microservices/payment/project.json**
4. **apps/microservices/jobs/project.json**
5. **apps/microservices/upload/project.json**

### Fix Pattern Applied

**Top-level build.options:**
```json
// Before
"args": ["--node-env=production"]

// After
"env": { "NODE_ENV": "production" }
```

**configurations.development:**
```json
// Before
"args": ["--node-env=development"]

// After
"env": { "NODE_ENV": "development" }
```

## Build Verification Results

Each microservice build verified after modification:

- **auth:** ✅ PASS — `webpack compiled successfully (b43718ceae718c6b)`
- **notes:** ✅ PASS — `webpack compiled successfully (e85cc76233caa9d0)`
- **payment:** ✅ PASS — `webpack compiled successfully (fa79733e387ee59b)`
- **jobs:** ✅ PASS — `webpack compiled successfully (9bc6002796101475)`
- **upload:** ✅ PASS — `webpack compiled successfully (cd4284a8cadc09ef)`

## Full Sanity Check

**Command:** `yarn nx run-many -t build`

**Result:**
```
NX   Successfully ran target build for 28 projects and 1 task they depend on

Nx read the output from the cache instead of running the command for 14 out of 29 tasks.
```

✅ **All green** — No regressions, all 28 projects built successfully.

## Formatting

**Command:** `npx prettier --write <5 files>`

**Result:** `Prettier: All files formatted correctly` — No changes needed; JSON already properly formatted.

## Commit

**SHA:** `348f22a`

**Message:** `fix(scaffold): webpack-cli 7 --node-env removal, align auth/notes/payment/jobs/upload with apps/api`

**Changes:**
- 5 files changed, 10 insertions(+), 10 deletions(-)

## Self-Review Findings

✅ **No concerns** — All files followed the identical structural pattern established in the brief. No unexpected project.json variations encountered. All builds pass cleanly. Change is purely mechanical and safe.

---

**Task Status:** ✅ COMPLETE

All 5 microservices successfully migrated to webpack-cli 7.2.1 compatible environment variable pattern. The fix is consistent, verified, and merged.
