# NexVault API contract — connected Supabase project

Endpoint (hard-coded in `nexvault.js`):

`https://aaymcbxsgioljwgahkwh.supabase.co/functions/v1/nexvault-api`

GalaxyBot requires only this NexVault environment variable:

`NEXVAULT_API=<64-character bot-scope key>`

Requests send `X-NV-API-Key: <key>` and `X-NV-Scope: bot`. The PHP website has a separate website-scope key in its server-only `config.local.php`.

The connected Supabase project is `aaymcbxsgioljwgahkwh` (eu-west-1). Its Edge Function performs custom key-hash/scope validation; do not set an Authorization Bearer credential for NexVault. The existing GalaxyBot owner-dashboard bridge remains separate and still uses its own `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables.
