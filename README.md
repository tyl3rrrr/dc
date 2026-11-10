# GalaxyBot v9.1.2

GalaxyBot v9 is a Discord.js v14 bot with per-server module management, moderation, utilities, AI support, private ticket channels, owner tools and an integrated NexVault code-distribution API client.

## What's new in v9.1.2

- **NexVault Edge Function fix:** the Supabase function URL is hard-coded in `nexvault.js`. Set `NEXVAULT_API` to only the dedicated 64-character bot-scope key from NexVault Admin Panel. The bot sends `X-NV-API-Key` and `X-NV-Scope: bot`; it no longer expects a complete URL or query-string key.
- **Separate Supabase clients:** NexVault uses its own scoped API-key header. The owner-dashboard bridge keeps its separate `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` settings; neither client is reused as the other's credential.

## What's new in v9.1.0

- **BloxdAtlas feedback forwarding:** the bot owner can set a destination text channel with `/feedback-bloxdatlas channel:#channel`. New guest and Discord-user submissions from Supabase are posted as embeds. The configuration is saved in `bloxd-feedback-config.json`.

## What's new in v9

- **Per-server module management:** `/manage` lets a server administrator enable/disable a whole module or individual commands. All modules and commands are enabled by default. Settings are stored per guild in `data.json`; another server is not affected. Disabled commands are removed from that server's Discord command picker and are also blocked by the runtime permission guard.
- **Server join setup notice:** when the bot joins a server, it posts an English setup message in the general/system channel and mentions the server owner plus configured/named administrator and moderator roles. It directs staff to `/settings` and `/manage`.
- **Private tickets:** `/ticket` creates a private text channel visible to the ticket creator, the configured support role, configured moderator/administrator roles and the bot. Ticket channels have **Claim** and **Close** controls. `/ticket-config` configures the category, staff role, Gemini toggle and server-specific support knowledge.
- **Gemini ticket assistant:** when `GEMINI_KEY` is configured and ticket AI is enabled, the assistant replies in the customer's language (English by default). It uses the server knowledge saved with `/ticket-config knowledge`. When the issue needs staff or cannot be solved confidently, it notifies the configured support/admin/mod roles. Staff can always take over manually.
- **Public links:** `/links` displays the current links. The bot owner can run `/links-manage` in a direct message to add, edit or delete entries. Set `DISCORD_INVITE_URL` to add the example “Join the Discord” link.
- **Owner inspection:** `/owner-inspect` is a normal, persistent DM menu with pagination for browsing project source files.
- **NexVault integration:** `/generate` retrieves active categories from the PHP API using autocomplete, verifies category guild/role requirements, assigns a code and sends it by DM. The existing `/status` also reports the NexVault API state if configured. The optional NexVault presence rotation remains disabled by default and does not require another `.env` entry.


## BloxdAtlas feedback bridge (v9.1)

- The bot polls the BloxdAtlas Supabase feedback table for new submissions and posts them as amber embeds in one configured server text channel.
- The bot owner sets the destination with `/feedback-bloxdatlas channel:#feedback`. This uses the existing central `bot-owner` permission guard and the owner ID already defined in `config.js` (or the optional `OWNER_ID` environment variable). Server administrators cannot change the destination unless they are also configured bot owners.
- The bot requires View Channel, Send Messages and Embed Links in the selected channel. It checks for new entries every 20 seconds. Only feedback submitted after the channel is selected is forwarded; older entries remain available on the public read-only page at `https://sl4m3d.xo.je/feedback.html`.
- The selected channel, last poll position and sent-entry IDs are stored in `bloxd-feedback-config.json`, created automatically beside `index.js`. Keep this file when updating the bot if you want to preserve the configured destination. It is intentionally not included in the source ZIP.
- The integration uses only the Supabase publishable key and public read access; it does not contain a service-role key, Discord bot token or Discord OAuth client secret.

## Requirements

- Node.js 20 or newer recommended (Node.js 18+ is supported by the bot's existing engine setting).
- A Discord application and bot token.
- `GEMINI_KEY` for Gemini ticket replies and the other AI features.
- The NexVault website and Supabase Edge Function hosted separately, plus a dedicated bot-scope API key generated in its Admin Panel.
- A host that can keep a Node.js process running. InfinityFree hosts the PHP website; it is not a persistent Node.js bot host.

## Installation

1. Extract the complete ZIP to your Node.js host. Run the bot commands from the archive's **root folder** (the folder containing `package.json`). The NexVault PHP website is delivered separately in `NexVault-sl4m3d-production.zip`.
2. Copy `.env.example` to `.env`.
3. Fill in `DISCORD_TOKEN` and `CLIENT_ID`.
4. Add the Gemini API key to `GEMINI_KEY` if AI ticket replies are required.
5. In NexVault Admin Panel, create or rotate the **bot-scoped API key**. Copy only the 64-character key into `.env` as `NEXVAULT_API=<key>`. The Edge Function URL is already hard-coded in `nexvault.js`; do not paste a URL or `?key=` query into the variable. Keep the key private.
6. Run:

   ```bash
   npm install
   npm run deploy
   npm start
   ```

   The bot automatically synchronizes DM-only commands globally and server commands separately for each server it has joined (`AUTO_DEPLOY=true`, default). If `GUILD_ID` is set, `npm run deploy` also registers server commands to that one server. A running bot should be restarted after a code update.

## Discord Developer Portal

Enable the following under **Bot → Privileged Gateway Intents** if you use the related features:

- **Server Members Intent:** welcome events and join-member handling.
- **Message Content Intent:** required for the legacy `!support` text command, Gemini's ability to read customer messages inside private ticket channels, and AI replies to bot mentions. Slash-command invocations themselves do not need it. Without this intent, private ticket channels still work, but the ticket AI cannot read normal message text.

Invite the bot with the `bot` and `applications.commands` scopes. The bot needs permission to view channels, send messages, create/manage channels, read message history, embed links, attach files, manage messages (for legacy `!support` deletion), and perform whichever moderation actions you enable. Administrator permission is easiest for a private test server; otherwise grant only the permissions needed by your enabled modules.

## First-time server setup

1. Run `/settings` and set the administrator and moderator roles plus any existing log/configuration channels.
2. Run `/ticket-config category` and select the category where ticket channels should be created.
3. Run `/ticket-config staff` and select the support team role. Configured admin/mod roles are also given ticket access.
4. Run `/ticket-config knowledge` and add the server's support instructions, known fixes, policy details and useful URLs. Do not add passwords, API keys or private account data.
5. Run `/ticket-config ai enabled:true` to enable the AI assistant. A valid `GEMINI_KEY` is required.
6. Run `/manage` to disable any modules or individual commands you do not want on this server. Every server has independent settings.

## Module and command management

`/manage` is available to the server owner and administrators. Pick a module, optionally pick an individual command, then use the enable/disable buttons. `/manage` and `/settings` remain available so an administrator can restore disabled features. Changes are saved automatically in `data.json` and synchronized to Discord's guild-specific command list.

Global DM commands (including `/owner-inspect`, `/links-manage` and `/login`) are registered separately and do not appear as server commands. Server commands are registered per guild, allowing each server to have a different command picker.

## Private ticket workflow

`/ticket` optionally accepts an initial `message`. GalaxyBot creates a private `#ticket-###` channel and grants access to its creator, configured support staff and configured admin/mod roles. The ticket card includes **Claim** and **Close** buttons. A staff member can claim a ticket; the creator or support staff can close it. `/ticket-close` is also available inside the ticket channel.

When the customer's message can be handled automatically, Gemini replies in the same language as the customer. If it determines that staff assistance is needed, it posts one escalation notice and pings configured ticket/admin/mod roles. The bot does not ping roles repeatedly for the same escalation. If Gemini is unavailable or no key is configured, the private ticket remains open for staff to handle manually.

Use `/ticket-config view` to inspect the current ticket configuration. `/ticket-config ai enabled:false` disables AI replies for that server without disabling private tickets.

## NexVault website deployment

The NexVault PHP site is delivered as a separate `NexVault-sl4m3d-production.zip` package. It uses the sl4m3d visual system and the same favicon set as the sl4m3d website. Upload the ZIP contents to the NexVault web root. Keep the live server-only `config.local.php` in place; the package intentionally contains only `config.local.php.example`, never the live API key.

The site and the bot call the same hard-coded Supabase Edge Function endpoint:

`https://aaymcbxsgioljwgahkwh.supabase.co/functions/v1/nexvault-api`

The website authenticates with its own website-scope key held privately in `config.local.php`. The bot authenticates with a different bot-scope key stored only in the bot host's `.env` as `NEXVAULT_API=<64-character-key>`. The bot sends `X-NV-API-Key` and `X-NV-Scope: bot`; the PHP site sends the website-scope headers. Do not reuse keys between scopes.

After deployment, sign in with the existing NexVault administrator and use Admin Panel → Discord bot API key to create/rotate the bot key. A new key revokes the previous active bot key, so update the bot host's `.env` immediately after rotating. Never put the key in a public repository, browser JavaScript or Discord messages.

**InfinityFree limitation:** its free-hosting security layer can block automated server-to-server API requests and return an HTML challenge/403 instead of JSON. If the bot reports non-JSON or 403, check the hosting/network path and the Edge Function logs; do not try to bypass the host's security layer. A different API host may be needed for guaranteed server-to-server access.

## Data and backups

- `data.json` stores GalaxyBot runtime settings, including per-guild module toggles, tickets, warnings, giveaways and other server data. It is created automatically on first start and is intentionally **not included in this release ZIP**. For an existing installation, keep your current `data.json` in the bot root while replacing the code; do not overwrite or delete it. Back it up before upgrading.
- NexVault users, categories, codes, redemptions and private file metadata are stored in the existing Supabase project. This bot release does not modify or reset that data.
- Uploaded NexVault files remain in the existing private Supabase Storage bucket. Do not delete that bucket or its objects during a website-code update.
- Back up `data.json` and the existing Supabase data before upgrades.

## Validation and operational notes

All JavaScript files pass Node's syntax parser, and all PHP files pass `php -l`. The bot also validates command payload names, descriptions and option structure before publishing them. A successful local check does not authenticate to Discord, Gemini or InfinityFree. Live command registration, role/channel permission checks and the NexVault API must be verified with the actual Discord application, keys and hosting account.

