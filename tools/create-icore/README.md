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

| Flag           | Values                                             | Default                     | Notes                                                                                                                |
| -------------- | -------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `--auth`       | `supabase` \| `firebase`                           | prompted                    | Auth provider                                                                                                        |
| `--db`         | `supabase` \| `firebase`                           | prompted (mirrors `--auth`) | Database backend. In v0.1.0 this is recorded but mirrors `--auth` implicitly. Independent db swap arrives in Plan 8. |
| `--upload`     | `supabase` \| `firebase` \| `cloudinary` \| `none` | prompted                    | File upload provider. Use `none` to remove the upload microservice entirely.                                         |
| `--ui`         | `shadcn` \| `antd` \| `mui`                        | `shadcn`                    | UI library. `shadcn` and `antd` are fully implemented. `mui` falls back to shadcn until Plan 6.2.                    |
| `--transport`  | `tcp` \| `redis` \| `nats`                         | `tcp`                       | Microservice transport                                                                                               |
| `--no-git`     | —                                                  | git enabled                 | Skip `git init`                                                                                                      |
| `--no-install` | —                                                  | install enabled             | Skip `yarn install`                                                                                                  |

> **Deprecated:** `--storage` is a deprecated alias for `--upload`. A warning is printed to stderr and the value is forwarded to `--upload`. Remove `--storage` from your scripts.

## Examples

```bash
# Full stack with Supabase + shadcn/ui
npm init @idevconn/icore my-saas -- --auth=supabase --db=supabase --upload=supabase --ui=shadcn

# Ant Design + Cloudinary
npm init @idevconn/icore my-saas -- --auth=supabase --db=supabase --upload=cloudinary --ui=antd

# Firebase auth + Cloudinary uploads
npm init @idevconn/icore my-app -- --auth=firebase --db=firebase --upload=cloudinary

# Skip the upload microservice entirely (--upload=none)
npm init @idevconn/icore api-only -- --auth=supabase --db=supabase --upload=none --no-install

# NATS transport
npm init @idevconn/icore my-app -- --auth=supabase --db=supabase --upload=supabase --transport=nats
```

## Building

Run `nx build create-icore` to build the library.

## Running unit tests

Run `nx test create-icore` to execute the unit tests via [Vitest](https://vitest.dev/).
