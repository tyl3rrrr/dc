# GalaxyBot v9.0.0

GalaxyBot v9 is a Discord.js v14 bot with per-server module management, moderation, utilities, AI support, private ticket channels, owner tools and an integrated NexVault code-distribution API client.

## What's new in v9

- **Per-server module management:** `/manage` lets a server administrator enable/disable a whole module or individual commands. All modules and commands are enabled by default. Settings are stored per guild in `data.json`; another server is not affected. Disabled commands are removed from that server's Discord command picker and are also blocked by the runtime permission guard.
- **Server join setup notice:** when the bot joins a server, it posts an English setup message in the general/system channel and mentions the server owner plus configured/named administrator and moderator roles. It directs staff to `/settings` and `/manage`.
- **Private tickets:** `/ticket` creates a private text channel visible to the ticket creator, the configured support role, configured moderator/administrator roles and the bot. Ticket channels have **Claim** and **Close** controls. `/ticket-config` configures the category, staff role, Gemini toggle and server-specific support knowledge.
- **Gemini ticket assistant:** when `GEMINI_KEY` is configured and ticket AI is enabled, the assistant replies in the customer's language (English by default). It uses the server knowledge saved with `/ticket-config knowledge`. When the issue needs staff or cannot be solved confidently, it notifies the configured support/admin/mod roles. Staff can always take over manually.
- **Public links:** `/links` displays the current links. The bot owner can run `/links-manage` in a direct message to add, edit or delete entries. Set `DISCORD_INVITE_URL` to add the example “Join the Discord” link.
- **Owner inspection:** `/owner-inspect` is a normal, persistent DM menu with pagination for browsing project source files.
- **NexVault integration:** `/generate` retrieves active categories from the PHP API using autocomplete, verifies category guild/role requirements, assigns a code and sends it by DM. The existing `/status` also reports the NexVault API state if configured. The optional `NEXVAULT_PRESENCE_ROTATION=true` setting activates the original NexVault 120-second Watching activity cycle.

## Requirements

- Node.js 20 or newer recommended (Node.js 18+ is supported by the bot's existing engine setting).
- A Discord application and bot token.
- `GEMINI_KEY` for Gemini ticket replies and the other AI features.
- The NexVault PHP website hosted separately, plus the complete API URL generated in its Admin Panel.
- A host that can keep a Node.js process running. InfinityFree hosts the PHP website; it is not a persistent Node.js bot host.

## Installation

1. Extract the complete ZIP to your Node.js host. Run the bot commands from the archive's **root folder** (the folder containing `package.json`). The separate `website/` folder is only the PHP upload bundle for InfinityFree.
2. Copy `.env.example` to `.env`.
3. Fill in `DISCORD_TOKEN` and `CLIENT_ID`.
4. Add the Gemini API key to `GEMINI_KEY` if AI ticket replies are required.
5. In the NexVault website Admin Panel, generate the Discord bot API URL and paste the complete URL into `NEXVAULT_API`. Keep the `?key=...` part intact. Do not put that key in a public repository or share it in Discord.
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

The `website/` directory in this archive is the complete PHP website bundle from the supplied NexVault website ZIP. Upload the **contents** of this directory to the InfinityFree domain's web root (`https://nexvault.is-great.org/`). Keep the supplied `config.php` unchanged; it is byte-for-byte identical to the file from your ZIP. Do **not** drop/recreate the existing MySQL database or re-import `schema.sql` on an installation that already contains users. Existing accounts and redemptions live in the external MySQL database and are not included in this code archive. Preserve `storage/` and any live uploads on the host.

After deployment, log in to NexVault as the existing administrator, open Admin Panel and generate/rotate the Discord bot API URL. Copy that complete URL into `.env` as `NEXVAULT_API`. The API key is shown only once by the website; if it is lost, rotate it in the Admin Panel and update `.env`.

**InfinityFree limitation:** its free-hosting security layer can block automated server-to-server API requests and return an HTML challenge/403 instead of JSON. If `/status` reports non-JSON, 403 or a blocked API, this is a hosting-layer limitation; the Node bot cannot safely bypass it. The PHP website may still work in a browser while `/generate` cannot reach its API. The API must be moved to a host that permits direct server-to-server requests for guaranteed `/generate` availability.

## Environment variables

| Variable | Purpose |
|---|---|
| `DISCORD_TOKEN` | Required Discord bot token |
| `CLIENT_ID` | Discord application ID (recommended for reference) |
| `OWNER_ID` | Optional additional bot owner user ID |
| `GEMINI_KEY` | Gemini API key for AI features and ticket assistant |
| `GEMINI_MODEL` | Optional Gemini model override; default `gemini-3.8-flash` |
| `NEXVAULT_API` | Complete API URL generated in the NexVault Admin Panel, including `?key=` |
| `NEXVAULT_WEBSITE_URL` | Public website URL; default `https://nexvault.is-great.org/` |
| `DISCORD_INVITE_URL` | Optional invite link displayed by `/links` as “Join the Discord” |
| `NEXVAULT_PRESENCE_ROTATION` | Optional `true` to enable NexVault's rotating Watching activity; default `false` |
| `AUTO_DEPLOY` | Set `false` to disable automatic Discord command synchronization |
| `GUILD_ID` | Optional target for explicit guild registration in `npm run deploy` |

A starter `.env.example` is included. Never upload `.env`, `data.json`, database credentials or the full `NEXVAULT_API` URL to GitHub.

## Data and backups

- `data.json` stores GalaxyBot runtime settings, including per-guild module toggles, tickets, warnings, giveaways and other server data. It is created automatically on first start and is intentionally **not included in this release ZIP**. For an existing installation, keep your current `data.json` in the bot root while replacing the code; do not overwrite or delete it. Back it up before upgrading.
- NexVault users, inventory and redemptions are stored in the website's MySQL database. The supplied PHP `config.php` is included byte-for-byte unchanged in `website/`; this project does not migrate, drop, recreate or reset the external SQL database. Do not run `schema.sql` on a database that already contains users.
- Preserve the complete live `website/storage/` folder and any uploaded item files on the hosting account when deploying an update. The uploaded source archive contains the `storage/items/` directory, but live uploaded files on InfinityFree are not part of this ZIP.
- Back up `data.json` and the NexVault MySQL database separately before upgrades.

## Validation and operational notes

All JavaScript files pass Node's syntax parser, and all PHP files pass `php -l`. The bot also validates command payload names, descriptions and option structure before publishing them. A successful local check does not authenticate to Discord, Gemini or InfinityFree. Live command registration, role/channel permission checks and the NexVault API must be verified with the actual Discord application, keys and hosting account.
