# GalaxyBot – Supabase/NexVault build

This is the revised Discord.js v14 bot. All AI features have been removed: no /ask or AI code generation commands, no AI message/DM replies, and no AI ticket automation. Private ticket channels, staff claim/close controls, applications and all unrelated bot modules remain.

## Requirements

- Node.js 20+ recommended (Node.js 18+ supported)
- Discord application + bot token
- The matching Supabase NexVault Edge Function and website bundle from the same ZIP

## Setup

1. Extract this folder on a Node.js host. It is separate from InfinityFree; InfinityFree cannot keep the Discord bot process running.
2. Open `.env` and set `DISCORD_TOKEN` and `CLIENT_ID`. The supplied NexVault URL/key are preconfigured for the linked GalaxyBot Supabase project; keep `.env` private.
3. Install and register commands:

   ```bash
   npm install
   npm run deploy
   npm start
   ```

4. Enable the Discord privileged intents only if needed: Server Members Intent for welcome events; Message Content Intent for the legacy `!support` command. Ticket channels still work without AI and staff respond manually.

## NexVault

`/generate` loads active categories from Supabase, enforces configured guild/role restrictions, asks the Edge Function to allocate a code atomically, and sends it by DM. `/status` checks the Edge API, database response, category count and available inventory in one request.

The bot uses `X-NV-API-Key` with a dedicated bot key. Do not publish `.env`, rotate the key if it is exposed, and never place a Supabase secret/service-role key in the bot.

## Tickets

Use `/ticket-config category` and `/ticket-config staff`. `/ticket-config view` shows the active setup. Ticket content remains in the private Discord ticket channel; the bot no longer sends it to an AI service.
