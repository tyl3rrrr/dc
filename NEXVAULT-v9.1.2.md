# NexVault integration update — GalaxyBot v9.1.2

- Hard-coded Edge Function: `https://aaymcbxsgioljwgahkwh.supabase.co/functions/v1/nexvault-api`
- `.env`: `NEXVAULT_API=<64-character bot-scope key>` only.
- Request headers: `X-NV-API-Key: <key>` and `X-NV-Scope: bot`.
- The PHP website uses a separate `website` scope key stored in server-only `config.local.php`.
- The owner-dashboard bridge is a separate Supabase integration and keeps `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` if its dashboard features are used. Do not reuse these values as the NexVault bot key.

Rotating the bot key in NexVault Admin Panel revokes the prior bot key. Update the bot host's `.env` immediately after a rotation and restart GalaxyBot.
