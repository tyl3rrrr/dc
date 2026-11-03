'use strict';
const storage = require('./storage');

const ALWAYS_ENABLED = new Set(['manage', 'settings']);
const MODULE_LABELS = {
  general: 'General', moderation: 'Moderation', admin: 'Administration', welcome: 'Welcome',
  apply: 'Applications', tickets: 'Tickets', reports: 'Reports', rules: 'Rules',
  partner: 'Partners', giveaway: 'Giveaways', utility: 'Utilities', bot: 'Bot tools', owner: 'Owner tools',
};

function moduleEnabled(guildId, moduleName) {
  if (!guildId || !moduleName) return true;
  const settings = storage.getGuildSettings(guildId);
  return settings.moduleToggles?.[moduleName] !== false;
}
function commandEnabled(guildId, command) {
  const name = typeof command === 'string' ? command : command?.data?.name;
  const moduleName = typeof command === 'string' ? null : command?.category;
  if (!guildId || !name || ALWAYS_ENABLED.has(name)) return true;
  const settings = storage.getGuildSettings(guildId);
  const category = moduleName || command?.category;
  if (category && settings.moduleToggles?.[category] === false) return false;
  return settings.commandToggles?.[name] !== false;
}
function isEnabled(guildId, command) {
  return commandEnabled(guildId, command);
}
function commandToggleEnabled(guildId, command) {
  const name = typeof command === 'string' ? command : command?.data?.name;
  if (!guildId || !name) return true;
  const settings = storage.getGuildSettings(guildId);
  return settings.commandToggles?.[name] !== false;
}
function effectiveStatus(guildId, command) {
  if (!commandToggleEnabled(guildId, command)) return 'Disabled individually';
  const category = command?.category;
  if (category && !moduleEnabled(guildId, category)) return 'Disabled with module';
  return 'Enabled';
}
function setModuleEnabled(guildId, name, enabled) {
  const settings = storage.getGuildSettings(guildId);
  const next = { ...(settings.moduleToggles || {}), [name]: Boolean(enabled) };
  storage.setGuildSetting(guildId, 'moduleToggles', next);
  return next[name];
}
function setCommandEnabled(guildId, name, enabled) {
  const settings = storage.getGuildSettings(guildId);
  const next = { ...(settings.commandToggles || {}), [name]: Boolean(enabled) };
  storage.setGuildSetting(guildId, 'commandToggles', next);
  return next[name];
}
function listModules(commands) {
  const names = [...new Set(commands.map(c => c.category).filter(Boolean))].filter(n => n !== 'owner');
  return names.map(value => ({ value, label: MODULE_LABELS[value] || value }));
}
function moduleCommands(commands, moduleName) {
  return commands.filter(c => c.category === moduleName && !ALWAYS_ENABLED.has(c.data.name));
}

module.exports = { ALWAYS_ENABLED, MODULE_LABELS, moduleEnabled, commandEnabled, commandToggleEnabled, effectiveStatus, isEnabled, setModuleEnabled, setCommandEnabled, listModules, moduleCommands };
