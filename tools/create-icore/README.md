# @idevconn/create-icore

Scaffold a new iCore monorepo project in seconds.

## Usage

```bash
npm init @idevconn/icore my-saas -- --auth=supabase --db=supabase --upload=supabase --ui=shadcn
```

`npm init @idevconn/icore` follows the standard npm convention — npm resolves it to `@idevconn/create-icore` and runs the bundled `create-icore` binary. Equivalent invocations:

```bash
yarn create @idevconn/icore my-saas                # yarn berry / classic
pnpm create @idevconn/icore my-saas                # pnpm
npx @idevconn/create-icore my-saas                 # direct
npm i -g @idevconn/create-icore && create-icore my-saas
```

## Flags

| Flag           | Values                                             | Default         | Notes                                                                                                                                                              |
| -------------- | -------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--auth`       | `supabase` \| `firebase`                           | prompted        | Auth provider                                                                                                                                                      |
| `--db`         | `supabase` \| `firebase`                           | prompted        | Database backend. Fully independent of `--auth` — mix-and-match combos like `--auth=firebase --db=supabase` are first-class.                                       |
| `--upload`     | `supabase` \| `firebase` \| `cloudinary` \| `none` | prompted        | File upload provider. Use `none` to remove the upload microservice entirely.                                                                                       |
| `--ui`         | `shadcn` \| `antd` \| `mui`                        | `shadcn`        | UI library. All three are fully implemented: `shadcn` (Tailwind 4 + shadcn/ui), `antd` (Ant Design 6), `mui` (MUI 6 / Material Design).                            |
| `--transport`  | `tcp` \| `redis` \| `nats`                         | `tcp`           | Microservice transport                                                                                                                                             |
| `--no-git`     | —                                                  | git enabled     | Skip `git init`                                                                                                                                                    |
| `--no-install` | —                                                  | install enabled | Skip `yarn install`                                                                                                                                                |
| `--config`     | path to `.json` file                               | —               | Pre-fill any wizard answer from a JSON file. Missing fields still prompt interactively. CLI flags override config values. See **Non-interactive / CI mode** below. |

> **Deprecated:** `--storage` is a deprecated alias for `--upload`. A warning is printed to stderr and the value is forwarded to `--upload`. Remove `--storage` from your scripts.

## Examples

```bash
# Full stack with Supabase + shadcn/ui
npm init @idevconn/icore my-saas -- --auth=supabase --db=supabase --upload=supabase --ui=shadcn

# Firebase auth + Supabase Postgres for app data (mix-and-match)
npm init @idevconn/icore my-saas -- --auth=firebase --db=supabase --upload=cloudinary --ui=shadcn

# Ant Design + Cloudinary
npm init @idevconn/icore my-saas -- --auth=supabase --db=supabase --upload=cloudinary --ui=antd

# Material UI + Firebase
npm init @idevconn/icore my-saas -- --auth=firebase --db=firebase --upload=cloudinary --ui=mui

# Firebase auth + Cloudinary uploads
npm init @idevconn/icore my-app -- --auth=firebase --db=firebase --upload=cloudinary

# Skip the upload microservice entirely (--upload=none)
npm init @idevconn/icore api-only -- --auth=supabase --db=supabase --upload=none --no-install

# NATS transport
npm init @idevconn/icore my-app -- --auth=supabase --db=supabase --upload=supabase --transport=nats
```

## Non-interactive / CI mode

Pass `--config <path>` to skip individual prompts using a JSON file. Any field omitted from the file is still asked interactively. Individual CLI flags always override config file values.

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

```bash
# Fully non-interactive — all fields in config, no prompts
npx @idevconn/create-icore --config ./my-config.json

# CLI flag overrides config value (firebase wins over supabase in the file)
npx @idevconn/create-icore --auth firebase --config ./my-config.json
```

Field names mirror the TypeScript `CreateIcoreOptions` type. Unknown fields are silently ignored. `targetDir` is always derived from `projectName` + the working directory and is ignored if present.

## Building

Run `nx build create-icore` to build the library.

## Running unit tests

Run `nx test create-icore` to execute the unit tests via [Vitest](https://vitest.dev/).
