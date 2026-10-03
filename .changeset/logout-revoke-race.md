---
'@idevconn/create-icore': patch
---

Logout and admin revoke-user now revoke the provider refresh token that was current at deletion (atomic GETDEL) instead of a possibly-rotated earlier read, and a refresh that loses to a concurrent logout revokes the token pair it just minted; SessionStore.update/delete now return whether/what they changed
