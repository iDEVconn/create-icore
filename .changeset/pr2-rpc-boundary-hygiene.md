---
"@idevconn/create-icore": patch
---

Fix two TCP RPC boundary bugs in the generated auth stack: auth.setRole/auth.magicLink.send now return {ok:true} instead of bare void (an empty TCP response crashes the gateway's firstValueFrom() with "no elements in sequence"), and PostgresAuthStrategy now throws RpcException instead of plain Error so domain error codes (invalid_credentials, user_already_exists, invalid_refresh_token) survive the TCP hop and map to the correct HTTP status at the gateway instead of a generic 500.
