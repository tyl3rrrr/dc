'use strict';
const crypto = require('crypto');
const { Routes } = require('discord.js');
const storage = require('./storage');
const moduleManager = require('./module-manager');

const INTEGRATION_GUILD_INSTALL = 0;
const CONTEXT_GUILD = 0;
const CONTEXT_BOT_DM = 1;
const NAME_REGEX = /^[-_\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u;

function normalizeCommand(cmd, scope) {
  const json = cmd.data.toJSON();
  json.default_member_permissions = null;
  delete json.dm_permission;
  if (scope === 'global-dm') {
    json.integration_types = [INTEGRATION_GUILD_INSTALL];
    json.contexts = [CONTEXT_BOT_DM];
  } else {
    delete json.integration_types;
    delete json.contexts;
  }
  return json;
}
function buildPayload(commandList, { scope = 'guild' } = {}) {
  if (scope === 'global') return commandList.filter(c => c.scope === 'anywhere').map(c => normalizeCommand(c, 'global-dm'));
  return commandList.map(c => normalizeCommand(c, 'guild'));
}
function buildGuildPayload(commandList, guildId) {
  return commandList.filter(cmd => cmd.scope !== 'dm' && !cmd.dmOnly && moduleManager.isEnabled(guildId, cmd)).map(cmd => normalizeCommand(cmd, 'guild'));
}
function buildDMPayload(commandList) {
  return commandList.filter(cmd => cmd.scope === 'anywhere').map(cmd => normalizeCommand(cmd, 'global-dm'));
}
function validatePayload(payload) {
  const errors = [];
  const names = new Set();
  if (payload.length > 100) errors.push(`Too many commands: ${payload.length} (maximum 100).`);
  const checkName = (label, name) => {
    if (typeof name !== 'string' || !NAME_REGEX.test(name)) errors.push(`${label}: invalid name "${name}".`);
    else if (name !== name.toLowerCase()) errors.push(`${label}: command name must be lowercase.`);
  };
  const checkDesc = (label, desc) => {
    if (typeof desc !== 'string' || desc.length < 1 || desc.length > 100) errors.push(`${label}: description must be 1-100 characters long.`);
  };
  const checkOptions = (label, options, allowSub = true) => {
    if (!options) return;
    if (options.length > 25) errors.push(`${label}: more than 25 options.`);
    const hasSub = options.some(o => o.type === 1 || o.type === 2);
    const hasOther = options.some(o => o.type !== 1 && o.type !== 2);
    if (hasSub && hasOther) errors.push(`${label}: subcommands cannot be mixed with regular options.`);
    if (hasSub && !allowSub) errors.push(`${label}: subcommand nesting is too deep.`);
    const seen = new Set();
    let optionalSeen = false;
    for (const opt of options) {
      const label2 = `${label} > ${opt.name}`;
      checkName(label2, opt.name);
      checkDesc(label2, opt.description);
      if (seen.has(opt.name)) errors.push(`${label2}: duplicate option name.`);
      seen.add(opt.name);
      if (opt.type === 1 || opt.type === 2) checkOptions(label2, opt.options, opt.type === 2);
      else {
        if (opt.required && optionalSeen) errors.push(`${label2}: required option follows an optional option.`);
        if (!opt.required) optionalSeen = true;
        if (opt.choices?.length > 25) errors.push(`${label2}: more than 25 choices.`);
      }
    }
  };
  for (const cmd of payload) {
    const label = `/${cmd.name}`;
    checkName(label, cmd.name);
    checkDesc(label, cmd.description);
    if (names.has(cmd.name)) errors.push(`${label}: duplicate command name.`);
    names.add(cmd.name);
    checkOptions(label, cmd.options, true);
  }
  return errors;
}
function hashPayload(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
async function getApplicationId(rest) {
  const app = await rest.get(Routes.oauth2CurrentApplication());
  return app.id;
}
async function registerGlobal(rest, appId, payload) {
  return rest.put(Routes.applicationCommands(appId), { body: payload });
}
async function registerGuild(rest, appId, guildId, payload) {
  return rest.put(Routes.applicationGuildCommands(appId, guildId), { body: payload });
}
async function syncGuild(client, guildId, commandList = [...client.commands.values()], force = false) {
  const payload = buildGuildPayload(commandList, guildId);
  const errors = validatePayload(payload);
  if (errors.length) throw new Error(`Guild command registration blocked: ${errors.join('; ')}`);
  const hashes = storage.getMeta('guildCommandHashes') || {};
  const hash = hashPayload(payload);
  if (!force && hashes[guildId] === hash) return { changed: false, count: payload.length };
  const registered = await registerGuild(client.rest, client.application.id, guildId, payload);
  storage.setMeta('guildCommandHashes', { ...hashes, [guildId]: hash });
  return { changed: true, count: registered.length };
}
async function syncIfChanged(client, commandList, log = console.log) {
  const dmPayload = buildDMPayload(commandList);
  const dmErrors = validatePayload(dmPayload);
  if (dmErrors.length) throw new Error(`DM command registration blocked: ${dmErrors.join('; ')}`);
  const dmHash = hashPayload(dmPayload);
  const dmRemote = await client.rest.get(Routes.applicationCommands(client.application.id));
  const dmRemoteNames = new Set(dmRemote.map(c => c.name));
  const dmLocalNames = new Set(dmPayload.map(c => c.name));
  const dmChanged = storage.getMeta('dmCommandHash') !== dmHash ||
    [...dmLocalNames].some(n => !dmRemoteNames.has(n)) || [...dmRemoteNames].some(n => !dmLocalNames.has(n));
  if (dmChanged) {
    const registered = await registerGlobal(client.rest, client.application.id, dmPayload);
    storage.setMeta('dmCommandHash', dmHash);
    log(`✅ ${registered.length} DM-only slash commands registered globally.`);
  } else {
    log(`✅ DM commands are in sync (${dmPayload.length}).`);
  }

  let changed = 0;
  for (const guild of client.guilds.cache.values()) {
    try {
      const result = await syncGuild(client, guild.id, commandList);
      if (result.changed) changed++;
    } catch (error) {
      log(`⚠️ Could not sync commands for ${guild.name} (${guild.id}): ${error.message}`);
    }
  }
  log(`✅ Server command visibility synchronized for ${client.guilds.cache.size} server(s); updated ${changed}.`);
  return { changed: dmChanged || changed > 0, guilds: client.guilds.cache.size };
}
module.exports = {
  buildPayload, buildGuildPayload, buildDMPayload, validatePayload, hashPayload,
  getApplicationId, registerGlobal, registerGuild, syncGuild, syncIfChanged,
};
