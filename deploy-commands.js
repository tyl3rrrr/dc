'use strict';
require('dotenv').config();
const { REST } = require('discord.js');
const commandList = require('./commands');
const tools = require('./command-tools');
const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN) { console.error('DISCORD_TOKEN is missing from .env.'); process.exit(1); }
(async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    const appId = await tools.getApplicationId(rest);
    if (CLIENT_ID && CLIENT_ID.trim() !== appId) console.warn(`CLIENT_ID differs from the application ID returned by this token (${appId}).`);
    const dmPayload = tools.buildDMPayload(commandList);
    const dmErrors = tools.validatePayload(dmPayload);
    if (dmErrors.length) throw new Error(`Invalid DM commands:\n- ${dmErrors.join('\n- ')}`);
    const dm = await tools.registerGlobal(rest, appId, dmPayload);
    console.log(`Registered ${dm.length} DM-only command(s) globally.`);
    if (GUILD_ID) {
      const guildPayload = tools.buildGuildPayload(commandList, GUILD_ID.trim());
      const errors = tools.validatePayload(guildPayload);
      if (errors.length) throw new Error(`Invalid server commands:\n- ${errors.join('\n- ')}`);
      const registered = await tools.registerGuild(rest, appId, GUILD_ID.trim(), guildPayload);
      console.log(`Registered ${registered.length} server command(s) for ${GUILD_ID}.`);
    } else {
      console.log('No GUILD_ID set. Start the bot to synchronize server-specific commands for every server it has joined.');
    }
  } catch (error) {
    console.error('Command deployment failed:', error.stack || error.message || error);
    process.exitCode = 1;
  }
})();
