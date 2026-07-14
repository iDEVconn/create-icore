---
"@idevconn/create-icore": patch
---

Fix two shadcn client UI gaps: LoginForm now gates the OAuth buttons and magic-link toggle behind VITE_AUTH_HAS_OAUTH/VITE_AUTH_HAS_MAGIC_LINK (written by the generator based on --auth=<provider>) instead of always rendering them, since postgres and mongodb don't implement either and clicking guaranteed a request failure; globals.css now defines the --color-popover and --color-accent tokens that dropdown-menu.tsx and dialog.tsx already reference, which previously compiled to a no-op (transparent background) since the tokens didn't exist. Also fixes `writeClientEnv` appending a second, contradictory VITE_AUTH_HAS_OAUTH/VITE_AUTH_HAS_MAGIC_LINK line onto the generated `apps/client/.env` instead of replacing the `.env.example` placeholder in place — the generated file no longer has each key defined twice with opposite values.
