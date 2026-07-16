---
"@idevconn/create-icore": patch
---

Fix the same OAuth/magic-link gating gap PR4 closed for client-shadcn, now for client-mui and client-antd: LoginForm was rendering the Google/GitHub buttons and magic-link toggle unconditionally even though postgres/mongodb don't implement either. Also fixes a related generator bug found during this work — client-mui's and client-antd's .env.example files were missing the VITE_AUTH_HAS_OAUTH/VITE_AUTH_HAS_MAGIC_LINK placeholder lines entirely (only client-shadcn had them), so writeClientEnv's regex-replace silently never wrote either var for --ui=mui/--ui=antd scaffolds.
