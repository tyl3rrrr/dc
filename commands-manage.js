'use strict';
const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder,
  ButtonBuilder, ButtonStyle,
} = require('discord.js');
const manager = require('./module-manager');
const commandTools = require('./command-tools');
const permissions = require('./permissions');
const { EPHEMERAL } = require('./util');
const PREFIX = 'mg:';

function custom(action, ownerId, moduleName, commandName = '') {
  return `${PREFIX}${action}:${ownerId}:${moduleName || '_'}${commandName ? `:${commandName}` : ''}`;
}
function makePanel(guildId, ownerId, commands, selectedModule = null, selectedCommand = null, notice = '') {
  const modules = manager.listModules(commands);
  const moduleOptions = modules.slice(0, 25).map(m => ({
    label: m.label.slice(0, 100), value: m.value,
    description: `Module ${manager.moduleEnabled(guildId, m.value) ? 'enabled' : 'disabled'}`,
    default: m.value === selectedModule,
  }));
  const rows = [];
  if (moduleOptions.length) {
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(custom('module', ownerId, selectedModule || '_'))
        .setPlaceholder('Select a module').addOptions(moduleOptions)
    ));
  }

  const selectedCommands = selectedModule ? manager.moduleCommands(commands, selectedModule) : [];
  const commandOptions = selectedCommands.slice(0, 25).map(c => ({
    label: `/${c.data.name}`.slice(0, 100), value: c.data.name,
    description: `${manager.effectiveStatus(guildId, c)} · ${(c.data.description || '').slice(0, 55)}`,
    default: c.data.name === selectedCommand,
  }));
  if (commandOptions.length) {
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(custom('command', ownerId, selectedModule))
        .setPlaceholder('Select an individual command').addOptions(commandOptions)
    ));
  }

  const buttons = [];
  if (selectedModule) {
    const moduleOn = manager.moduleEnabled(guildId, selectedModule);
    buttons.push(new ButtonBuilder().setCustomId(custom('toggle-module', ownerId, selectedModule))
      .setLabel(`${moduleOn ? 'Disable' : 'Enable'} ${manager.MODULE_LABELS[selectedModule] || selectedModule}`)
      .setStyle(moduleOn ? ButtonStyle.Danger : ButtonStyle.Success));
  }
  if (selectedModule && selectedCommand) {
    const cmd = commands.find(c => c.data.name === selectedCommand && c.category === selectedModule);
    if (cmd) {
      const commandOn = manager.commandToggleEnabled(guildId, cmd);
      buttons.push(new ButtonBuilder().setCustomId(custom('toggle-command', ownerId, selectedModule, selectedCommand))
        .setLabel(`${commandOn ? 'Disable' : 'Enable'} /${selectedCommand}`)
        .setStyle(commandOn ? ButtonStyle.Danger : ButtonStyle.Success));
    }
  }
  if (buttons.length) rows.push(new ActionRowBuilder().addComponents(buttons.slice(0, 2)));

  const lines = modules.map(m => `${manager.moduleEnabled(guildId, m.value) ? '🟢' : '🔴'} **${m.label}**`).join('\n');
  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('⚙️ Server Module Manager')
    .setDescription('Control modules and individual slash commands for this server only. Disabled commands are removed from this server\'s command picker. Changes are saved automatically.')
    .addFields({ name: 'Module status', value: lines.slice(0, 1024) || 'No configurable modules.' });
  if (selectedModule) {
    const moduleCmds = selectedCommands;
    embed.addFields({ name: `Selected: ${manager.MODULE_LABELS[selectedModule] || selectedModule}`,
      value: `Module: **${manager.moduleEnabled(guildId, selectedModule) ? 'Enabled' : 'Disabled'}**\n` +
        `${moduleCmds.length} command(s):\n` + moduleCmds.map(c => `${manager.commandToggleEnabled(guildId, c) ? '🟢' : '🔴'} /${c.data.name} (${manager.effectiveStatus(guildId, c)})`).join(' · ').slice(0, 1000) });
  }
  if (selectedCommand) {
    const cmd = commands.find(c => c.data.name === selectedCommand);
    if (cmd) embed.addFields({ name: `Command: /${selectedCommand}`, value: `Status: **${manager.effectiveStatus(guildId, cmd)}**` });
  }
  if (notice) embed.setFooter({ text: notice.slice(0, 200) });
  return { embeds: [embed], components: rows };
}

const manage = {
  data: new SlashCommandBuilder().setName('manage').setDescription('Manage this server\'s modules and individual commands'),
  async execute(interaction) {
    if (!interaction.inGuild()) return void await interaction.reply({ content: 'Use `/manage` inside a server.', flags: EPHEMERAL });
    const cmds = [...interaction.client.commands.values()];
    await interaction.reply({ ...makePanel(interaction.guildId, interaction.user.id, cmds), flags: EPHEMERAL });
  },
};

async function handleComponent(interaction) {
  if (!interaction.inGuild() || !interaction.guildId) return void await interaction.reply({ content: 'This panel only works in a server.', flags: EPHEMERAL });
  const parts = interaction.customId.slice(PREFIX.length).split(':');
  const action = parts[0];
  const ownerId = parts[1];
  const moduleName = parts[2] === '_' ? null : parts[2];
  const commandName = parts[3] || null;
  if (interaction.user.id !== ownerId) return void await interaction.reply({ content: 'This management panel belongs to another administrator. Run `/manage` to open your own.', flags: EPHEMERAL });
  if (permissions.getInteractionLevel(interaction) < permissions.LEVEL.ADMIN) return void await interaction.reply({ content: 'You no longer have administrator access to manage this server.', flags: EPHEMERAL });
  const commands = [...interaction.client.commands.values()];
  let nextModule = moduleName;
  let nextCommand = commandName;
  let notice = '';
  let acknowledged = false;

  if (action === 'module' && interaction.isStringSelectMenu()) {
    nextModule = interaction.values[0];
    nextCommand = null;
  } else if (action === 'command' && interaction.isStringSelectMenu()) {
    nextCommand = interaction.values[0];
  } else if (action === 'toggle-module' && interaction.isButton()) {
    await interaction.deferUpdate();
    acknowledged = true;
    const next = !manager.moduleEnabled(interaction.guildId, moduleName);
    manager.setModuleEnabled(interaction.guildId, moduleName, next);
    nextCommand = null;
    try {
      await commandTools.syncGuild(interaction.client, interaction.guildId, commands);
      notice = `${manager.MODULE_LABELS[moduleName] || moduleName} ${next ? 'enabled' : 'disabled'}; server commands synchronized.`;
    } catch (err) {
      notice = `Setting saved, but Discord command synchronization failed: ${String(err.message || err).slice(0, 120)}`;
    }
  } else if (action === 'toggle-command' && interaction.isButton()) {
    const cmd = commands.find(c => c.data.name === commandName && c.category === moduleName);
    if (!cmd || ['manage', 'settings'].includes(commandName)) return void await interaction.reply({ content: 'This command cannot be changed here.', flags: EPHEMERAL });
    await interaction.deferUpdate();
    acknowledged = true;
    const next = !manager.commandToggleEnabled(interaction.guildId, cmd);
    manager.setCommandEnabled(interaction.guildId, commandName, next);
    try {
      await commandTools.syncGuild(interaction.client, interaction.guildId, commands);
      notice = `/${commandName} ${next ? 'enabled' : 'disabled'}; server commands synchronized.`;
    } catch (err) {
      notice = `Setting saved, but Discord command synchronization failed: ${String(err.message || err).slice(0, 120)}`;
    }
  } else {
    return void await interaction.reply({ content: 'This management panel has expired. Run `/manage` again.', flags: EPHEMERAL });
  }
  const updated = makePanel(interaction.guildId, ownerId, commands, nextModule, nextCommand, notice);
  if (acknowledged) await interaction.editReply(updated);
  else await interaction.update(updated);
}

module.exports = { manage, handleComponent, PREFIX, makePanel };
