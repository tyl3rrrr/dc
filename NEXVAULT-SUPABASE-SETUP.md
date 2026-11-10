# NexVault connection — GalaxyBot v9.1.2

NexVault is deployed to the Supabase project currently connected in ChatGPT (`aaymcbxsgioljwgahkwh`, eu-west-1).

- Edge Function: `https://aaymcbxsgioljwgahkwh.supabase.co/functions/v1/nexvault-api`
- The URL is hard-coded in `nexvault.js`.
- The only NexVault setting in the bot `.env` is `NEXVAULT_API=<64-character bot-scope key>`.
- Requests send `X-NV-API-Key` and `X-NV-Scope: bot`.

The owner dashboard remains an independent integration and still needs its own server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Do not reuse those values as the NexVault API key. No private `.env` or Discord token is included in this archive.
