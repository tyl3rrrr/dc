# NexVault API hotfix (important)

The previous GalaxyBot v9 NexVault client called the legacy PHP endpoint on the InfinityFree site (`NEXVAULT_API` ending in `.php`). InfinityFree can answer automated requests with an HTML/JavaScript challenge page, which causes the exact `Website API returned non-JSON (HTTP 200; text/html)` message.

This package replaces that client with `nexvault.js`, which calls the Supabase Edge Function directly. Do not configure the NexVault API to point at `nexvault.is-great.org/api` or any `.php` URL.

## Apply to the running bot

1. Back up the current bot folder.
2. Replace the bot source files with the contents of this `bot code` folder. Do not keep the old `nexvault.js` or old `commands-nexvault.js` versions.
3. Keep the running bot's existing `.env` values for `DISCORD_TOKEN`, `CLIENT_ID`, `OWNER_ID`, `GUILD_ID`, and other Discord settings.
4. Open `.env.nexvault.private` and copy its four `NEXVAULT_...` entries into the existing `.env`. Remove the obsolete `NEXVAULT_API=` entry. Do not overwrite the whole `.env` file.
5. Restart the bot process and run `/status`, then test `/generate` only after categories and codes have been imported.

The bot key in `.env.nexvault.private` is a private server-to-server credential. Do not put it in website JavaScript, HTML, screenshots, Discord messages, or a public repository. `.gitignore` excludes the private overlay.

## Expected status before inventory import

The API should report Online, Categories: 0 and Available codes: 0. Zero inventory is expected until legacy items/categories/codes have been imported.
