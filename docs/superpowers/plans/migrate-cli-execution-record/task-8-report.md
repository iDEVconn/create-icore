# Task 8 — Documentation — Completion Report

## Summary

Task 8 (the final task of the 8-task migrate CLI plan) has been completed successfully. All documentation updates have been applied and committed.

## Changes Made

### 1. `tools/create-icore/README.md`

Added a new "Migrating an existing project" section (before the existing "Running unit tests" section, as the Contributing section did not yet exist):

- Documents the `create-icore migrate --to <version>` command syntax
- Explains that migrate requires a clean git working tree
- Describes the two migration modes:
  - Mechanical fixes applied and committed automatically
  - Fixes requiring judgment that pause for manual application
- Notes that re-running the same command is always safe and picks up where migrations left off
- Clarifies that `--continue` flag is accepted but not necessary

### 2. `AGENTS.md`

Updated the Architecture section's `tools/` tree diagram to clarify the create-icore tool's dual purpose:

**Before:**

```
└── create-icore/         # npx CLI source
```

**After:**

```
└── create-icore/         # npx CLI source (scaffold new projects; `create-icore migrate` upgrades existing ones)
```

## Verification

- ✅ No drift in `tools/create-icore/templates/` directory (verified with `git diff --name-only`)
- ✅ Prettier formatting applied and verified (both files report "correctly formatted")
- ✅ Both files staged and committed with message: `docs(create-icore): document the migrate subcommand`
- ✅ Commit SHA: `b82317a`

## Status

**COMPLETE** — Task 8 is ready. The migration CLI functionality (Tasks 1–7) is documented for end users, and the architecture reference in AGENTS.md reflects the full scope of the create-icore tool.
