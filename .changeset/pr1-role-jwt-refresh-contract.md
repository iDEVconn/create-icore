---
"@idevconn/create-icore": patch
---

Fix two auth contract gaps in generated projects: the auth MS now re-mints the session after assigning a user's initial role, so the first JWT a client receives already carries it (previously only visible after the next login/refresh); the client's create-api.ts now overrides @idevconn/api-client's snake_case token-field defaults to match the gateway's camelCase AuthSession contract, so automatic token refresh actually works instead of silently no-op'ing and force-logging-out users at JWT_EXPIRES_IN.
