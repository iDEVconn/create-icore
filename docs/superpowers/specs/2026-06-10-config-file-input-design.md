# Config File Input for create-icore CLI

**Date:** 2026-06-10  
**Branch:** `feature/config-file-input`  
**Status:** Approved

## Problem

`create-icore` only accepts options through an interactive terminal wizard or individual `--flag value` pairs. CI pipelines, automated scaffolding scripts, and repeated project generation require a non-interactive batch mode.

## Goal

Add `--config <path>` flag that reads a JSON file and pre-fills wizard answers, skipping prompts for any field provided. Missing fields fall back to the interactive wizard as normal.

## Architecture

### Files changed

```
tools/create-icore/src/lib/
  config.ts           — NEW: loadConfig(), validateConfig(), ConfigFileError
  prompts.ts          — parseFlags() +1 case; collectOptions() +~15 lines
  options.ts          — no changes (types already correct)
  scaffold.ts         — no changes

docs/
  architecture.md     — add "Non-interactive / CI mode" section
README.md             — add --config usage example
```

### Data flow

```
argv
  → parseFlags()          → { ...flags, _configPath?: string }
                                       ↓
                          _configPath? → loadConfig(path)
                                       ↓
                          merge(configFileValues, cliFlags)
                          (CLI flags override config file values)
                                       ↓
                          collectOptions() → wizard for remaining empty fields
                                       ↓
                          CreateIcoreOptions → scaffold()
```

**Priority (highest → lowest):** individual CLI flags > `--config` JSON values > interactive wizard prompts

Example: `--auth firebase --config base.json` where `base.json` has `authProvider: "supabase"` → result is `firebase` (CLI wins).

## `config.ts` API

```typescript
export class ConfigFileError extends Error {}

/**
 * Reads JSON from filePath, validates, returns Partial<CreateIcoreOptions>.
 * Throws ConfigFileError for missing file, invalid JSON, or invalid field values.
 */
export async function loadConfig(filePath: string): Promise<Partial<CreateIcoreOptions>>;

/**
 * Pure validation — no IO. Accepts unknown, returns Partial<CreateIcoreOptions>.
 * Unknown keys are silently ignored (forward compatibility).
 * Throws ConfigFileError with a message identifying the bad field + valid options.
 */
export function validateConfig(raw: unknown): Partial<CreateIcoreOptions>;
```

### Validation rules

| Field            | Valid values                                                    |
| ---------------- | --------------------------------------------------------------- |
| `projectName`    | `/^[a-z0-9-]+$/i` (same regex as wizard)                        |
| `authProvider`   | `supabase` \| `firebase` \| `mongodb`                           |
| `dbProvider`     | `supabase` \| `firebase` \| `mongodb`                           |
| `upload`         | `supabase` \| `firebase` \| `cloudinary` \| `mongodb` \| `none` |
| `payment`        | `paypal` \| `none`                                              |
| `jobs`           | `bullmq` \| `none`                                              |
| `example`        | `notes` \| `none`                                               |
| `ui`             | `shadcn` \| `antd` \| `mui`                                     |
| `transport`      | `tcp` \| `redis` \| `nats` \| `mqtt` \| `rmq` \| `kafka`        |
| `packageManager` | `yarn` \| `npm` \| `pnpm`                                       |
| `initGit`        | boolean                                                         |
| `install`        | boolean                                                         |
| `targetDir`      | ignored (always derived from `projectName` + `cwd`)             |
| unknown keys     | ignored silently                                                |

### Error messages

```
ConfigFileError: config file not found: ./my.json
ConfigFileError: config file is not valid JSON: Unexpected token ...
ConfigFileError: config field "authProvider" got "postgres", expected one of: supabase, firebase, mongodb
```

All errors surface via existing `main().catch()` in `cli.ts` → `p.log.error()` + `process.exit(1)`.

## `parseFlags()` change

One new case in the existing `switch`:

```typescript
case 'config':
  out._configPath = v;
  break;
```

`_configPath` is a transient field — consumed by `collectOptions()` immediately after `parseFlags()` returns, never forwarded to `CreateIcoreOptions`.

## `collectOptions()` change

After `parseFlags()`, before the first prompt:

```typescript
const flags = parseFlags(argv);

if (flags._configPath) {
  const configValues = await loadConfig(flags._configPath);
  // CLI flags override config: spread config first, then CLI flags on top
  Object.assign(flags, { ...configValues, ...flags });
  delete flags._configPath;
}
```

Then the wizard continues unchanged — each prompt checks `flags.<field> ?? (await p.select(...))`.

## JSON config format

Field names mirror `CreateIcoreOptions` (TypeScript style, not CLI-flag style).

```json
{
  "projectName": "demo-saas",
  "authProvider": "supabase",
  "dbProvider": "supabase",
  "upload": "cloudinary",
  "payment": "none",
  "jobs": "bullmq",
  "example": "notes",
  "ui": "shadcn",
  "transport": "nats",
  "packageManager": "yarn",
  "initGit": true,
  "install": false
}
```

Partial config (only known fields; rest → wizard):

```json
{
  "authProvider": "supabase",
  "dbProvider": "supabase"
}
```

## Testing

### New: `config.unit.test.ts`

| Test                               | Assertion                                                |
| ---------------------------------- | -------------------------------------------------------- |
| full valid object                  | returns `Partial<CreateIcoreOptions>` with all fields    |
| partial valid object               | returns only provided fields                             |
| unknown keys                       | silently ignored, no error                               |
| invalid `authProvider` value       | throws `ConfigFileError` with field name + valid options |
| invalid `projectName` pattern      | throws `ConfigFileError`                                 |
| non-boolean `initGit`              | throws `ConfigFileError`                                 |
| `loadConfig` — file not found      | throws `ConfigFileError`                                 |
| `loadConfig` — invalid JSON string | throws `ConfigFileError`                                 |

### Extended: `prompts.unit.test.ts`

| Test                                   | Assertion                     |
| -------------------------------------- | ----------------------------- |
| `parseFlags(['--config', './x.json'])` | `{ _configPath: './x.json' }` |
| `parseFlags(['--config=./x.json'])`    | `{ _configPath: './x.json' }` |

### Docs to update

- `docs/architecture.md` — add "Non-interactive / CI mode" section
- `tools/create-icore/README.md` — add `--config` flag with example JSON
