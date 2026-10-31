// commands-presence.js
// /bot-status - bot owner only (see reasoning below), several subcommands
//
// WHY /bot-status IS NOT delegated to regular server administrators:
// Discord presence (Online/Idle/DND/Streaming) belongs to the bot's ONE
// gateway connection and is therefore NECESSARILY identical across ALL
// servers at once - Discord provides no per-server separation for this.
// If this command were open to every server's administrator, an admin of
// ANY server the bot is in could change the status on EVERY OTHER server -
// which looks exactly like "other people can affect my server" and is not
// what anyone wants. So this command is restricted to the bot owner (see
// config.js, OWNER_ID/superuser) - the one person already responsible for
// the bot across every server it runs on.
// Access is checked centrally in permissions.js (access: 'bot-owner' / 'superuser').

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, ActivityType } = require('discord.js');
const presence = require('./presence');
const config = require('./config');
const { EPHEMERAL } = require('./util');

const STATUS_CHOICES = [
  { name: 'Online', value: 'online' },
  { name: 'Idle / AFK', value: 'idle' },
  { name: 'Do Not Disturb', value: 'dnd' },
  { name: 'Invisible / Offline', value: 'invisible' },
];
const ACTIVITY_CHOICES = [
  { name: 'Playing', value: 'playing' },
  { name: 'Watching', value: 'watching' },
  { name: 'Listening', value: 'listening' },
  { name: 'Competing', value: 'competing' },
  { name: 'Streaming (Twitch/YouTube URL)', value: 'streaming' },
];

const MENU_PREFIX = 'presenceui:';
const ACTIVITY_LABELS = { playing: '🎮 Playing', watching: '👀 Watching', listening: '🎧 Listening', competing: '🏆 Competing', streaming: '📡 Streaming' };

function menuEmbed(client) {
  const cfg = presence.getConfig();
  const users = client.guilds.cache.reduce((sum, guild) => sum + (guild.memberCount || 0), 0);
  const uptime = Math.floor((client.uptime || 0) / 1000);
  const fmt = (n) => n.toLocaleString('en-US');
  return new EmbedBuilder().setColor(0x5865f2).setTitle('🌌 GalaxyBot • Presence Studio')
    .setDescription('Configure the bot-wide presence using the menus below. Changes apply everywhere the bot is present.')
    .addFields(
      { name: '🟢 Online status', value: `**${cfg.status || 'online'}**`, inline: true },
      { name: '🎭 Activity', value: cfg.activity ? `${ACTIVITY_LABELS[cfg.activity.type] || cfg.activity.type}\n${cfg.activity.text}` : (cfg.streaming ? `📡 Streaming\n${cfg.streaming.url}` : 'Automatic server count'), inline: true },
      { name: '📊 Bot statistics', value: `**Servers:** ${fmt(client.guilds.cache.size)}\n**Server member total:** ${fmt(users)}*\n**Uptime:** ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m\n**Ping:** ${Math.max(0, Math.round(client.ws.ping))} ms`, inline: false }
    ).setFooter({ text: '*Member total may count the same person in multiple servers. Custom status is not supported for bot accounts.' });
}

function menuComponents() {
  return [
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`${MENU_PREFIX}status`).setPlaceholder('🟢 Choose online status').addOptions(
      { label: 'Online', value: 'online', emoji: '🟢' }, { label: 'Idle / AFK', value: 'idle', emoji: '🌙' }, { label: 'Do Not Disturb', value: 'dnd', emoji: '⛔' }, { label: 'Invisible / Offline', value: 'invisible', emoji: '⚫' })),
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`${MENU_PREFIX}activity`).setPlaceholder('🎭 Choose activity type').addOptions(
      { label: 'Playing', value: 'playing', emoji: '🎮' }, { label: 'Listening', value: 'listening', emoji: '🎧' }, { label: 'Watching', value: 'watching', emoji: '👀' }, { label: 'Competing', value: 'competing', emoji: '🏆' }, { label: 'Streaming', value: 'streaming', emoji: '📡' }, { label: 'Automatic server count', value: 'auto', emoji: '🔄' })),
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`${MENU_PREFIX}template`).setPlaceholder('📈 Quick status templates').addOptions(
      { label: 'Helping users', value: 'users', description: 'Shows a server-member total' }, { label: 'Serving servers', value: 'servers', description: 'Shows the number of servers' }, { label: 'Bot uptime', value: 'uptime', description: 'Shows how long the bot has been online' }, { label: 'Custom text…', value: 'custom', description: 'Enter your own activity text' })),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`${MENU_PREFIX}refresh`).setLabel('Refresh statistics').setEmoji('🔄').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`${MENU_PREFIX}clear`).setLabel('Clear activity').setEmoji('🧹').setStyle(ButtonStyle.Secondary))
  ];
}

async function handleComponent(interaction) {
  if (!interaction.customId.startsWith(MENU_PREFIX)) return;
  const action = interaction.customId.slice(MENU_PREFIX.length);
  const client = interaction.client;
  const who = `${interaction.user.tag} (${interaction.user.id})`;
  if (action === 'refresh') return interaction.update({ embeds: [menuEmbed(client)], components: menuComponents() });
  if (action === 'status') {
    presence.setManual({ status: interaction.values[0], setBy: who }); await presence.apply(client);
  } else if (action === 'activity') {
    const type = interaction.values[0];
    if (type === 'auto') presence.setAuto(who);
    else if (type === 'streaming') {
      const modal = new ModalBuilder().setCustomId(`${MENU_PREFIX}stream-modal`).setTitle('Set streaming activity').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('url').setLabel('Stream URL (Twitch or YouTube)') .setStyle(TextInputStyle.Short).setPlaceholder('https://www.twitch.tv/yourchannel').setRequired(true).setMaxLength(200)));
      return interaction.showModal(modal);
    } else {
      const modal = new ModalBuilder().setCustomId(`${MENU_PREFIX}text-modal:${type}`).setTitle(`Set ${type} activity`).addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('text').setLabel('Activity text').setStyle(TextInputStyle.Short).setPlaceholder('e.g. /help • helping communities').setRequired(true).setMaxLength(128)));
      return interaction.showModal(modal);
    }
    return interaction.update({ embeds: [menuEmbed(client)], components: menuComponents() });
  } else if (action === 'template') {
    const selected = interaction.values[0];
    if (selected === 'custom') {
      const modal = new ModalBuilder().setCustomId(`${MENU_PREFIX}text-modal:playing`).setTitle('Custom activity text').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('text').setLabel('Activity text').setStyle(TextInputStyle.Short).setPlaceholder('GalaxyBot | /help').setRequired(true).setMaxLength(128)));
      return interaction.showModal(modal);
    }
    const count = selected === 'servers' ? client.guilds.cache.size : selected === 'users' ? client.guilds.cache.reduce((sum, guild) => sum + (guild.memberCount || 0), 0) : Math.floor((client.uptime || 0) / 1000);
    const text = selected === 'servers' ? `Active on ${count} servers` : selected === 'users' ? `Helping ${count.toLocaleString('en-US')} server-members` : `Online for ${Math.floor(count / 3600)}h ${Math.floor((count % 3600) / 60)}m`;
    presence.setManual({ status: presence.getConfig().status || 'online', activityType: 'playing', activityText: text, setBy: who }); await presence.apply(client);
  } else if (action === 'clear') { presence.clearActivity(who); await presence.apply(client); }
  return interaction.update({ embeds: [menuEmbed(client)], components: menuComponents() });
}

async function handleModal(interaction) {
  if (!interaction.customId.startsWith(MENU_PREFIX)) return;
  const who = `${interaction.user.tag} (${interaction.user.id})`;
  if (interaction.customId === `${MENU_PREFIX}stream-modal`) {
    const url = interaction.fields.getTextInputValue('url').trim();
    if (!/^https?:\/\//i.test(url)) return interaction.reply({ content: 'Please provide a valid https:// or http:// stream URL.', ephemeral: true });
    presence.setManual({ status: 'online', streamingUrl: url, setBy: who });
  } else {
    const type = interaction.customId.split(':').pop();
    const text = interaction.fields.getTextInputValue('text').trim();
    if (!text) return interaction.reply({ content: 'Activity text cannot be empty.', ephemeral: true });
    presence.setManual({ status: presence.getConfig().status || 'online', activityType: type, activityText: text, setBy: who });
  }
  await presence.apply(interaction.client);
  return interaction.reply({ embeds: [menuEmbed(interaction.client)], components: menuComponents(), ephemeral: true });
}


function describeConfig(cfg) {
  if (cfg.mode !== 'manual') return 'Automatic (shows the current server count)';
  if (cfg.streaming) return `Streaming - ${cfg.streaming.url}`;
  if (cfg.activity) return `${cfg.status || 'online'} - ${cfg.activity.type} ${cfg.activity.text}`;
  return cfg.status || 'online';
}

function historyLines(cfg) {
  const history = Array.isArray(cfg.history) ? cfg.history : [];
  if (history.length === 0) return 'No changes recorded yet.';
  return history
    .slice(0, 5)
    .map((h) => `<t:${Math.floor(h.at / 1000)}:R> — **${h.action}** by ${h.by || 'unknown'}`)
    .join('\n');
}

// Note: "/status" is already taken in this bot by the EXISTING command that
// checks whether the website is reachable (commands-core.js) - per the brief,
// existing functionality is not removed without an explicit request. That's
// why this command is called "/bot-status".
const botStatus = {
  data: new SlashCommandBuilder()
    .setName('bot-status')
    .setDescription('Bot owner only: manage the bot online status (technically bot-wide, not per server)')
    .addSubcommand((sub) => sub.setName('menu').setDescription('Opens the interactive Presence Studio menu'))
    .addSubcommand((sub) => sub.setName('view').setDescription('Shows the current status and recent change history'))
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Sets the online status, and optionally a custom activity')
        .addStringOption((o) => o.setName('status').setDescription('Online status').setRequired(true).addChoices(...STATUS_CHOICES))
        .addStringOption((o) => o.setName('activity-type').setDescription('Type of activity (optional)').setRequired(false).addChoices(...ACTIVITY_CHOICES.filter((choice) => choice.value !== 'streaming')))
        .addStringOption((o) => o.setName('activity-text').setDescription('Activity text (optional, needs activity-type)').setRequired(false).setMaxLength(128))
    )
    .addSubcommand((sub) =>
      sub
        .setName('streaming')
        .setDescription(`Sets the status to Twitch streaming (default name: ${config.TWITCH_DEFAULT_NAME})`)
        .addStringOption((o) => o.setName('url').setDescription('Twitch URL (optional, overrides the default name)').setRequired(false))
    )
    .addSubcommand((sub) => sub.setName('clear-activity').setDescription('Keeps the current status but removes any custom activity/streaming'))
    .addSubcommand((sub) => sub.setName('auto').setDescription('Switches back to automatic mode (shows the current server count)')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const who = `${interaction.user.tag} (from: ${interaction.guild.name})`;

    if (sub === 'menu') {
      await interaction.reply({ embeds: [menuEmbed(interaction.client)], components: menuComponents(), flags: EPHEMERAL });
      return;
    }

    if (sub === 'view') {
      const cfg = presence.getConfig();
      const embed = new EmbedBuilder()
        .setTitle('🤖 Bot Status')
        .setColor(0x5865f2)
        .addFields(
          { name: 'Current', value: describeConfig(cfg) },
          { name: 'Last changed by', value: cfg.setBy || 'unknown', inline: true },
          { name: 'Last changed at', value: cfg.setAt ? `<t:${Math.floor(cfg.setAt / 1000)}:R>` : 'never', inline: true },
          { name: 'Recent history', value: historyLines(cfg) }
        )
        .setFooter({ text: 'Presence is bot-wide, not per server - see the command description.' });
      await interaction.reply({ embeds: [embed], flags: EPHEMERAL });
      return;
    }

    if (sub === 'auto') {
      presence.setAuto(who);
      await presence.apply(interaction.client);
      await interaction.reply({ content: '✅ Switched back to automatic mode (shows the current server count).', flags: EPHEMERAL });
      return;
    }

    if (sub === 'clear-activity') {
      presence.clearActivity(who);
      await presence.apply(interaction.client);
      await interaction.reply({ content: '✅ Custom activity/streaming removed - status kept as-is.', flags: EPHEMERAL });
      return;
    }

    if (sub === 'streaming') {
      const url = interaction.options.getString('url') || `https://www.twitch.tv/${config.TWITCH_DEFAULT_NAME}`;
      presence.setManual({ streamingUrl: url, setBy: who });
      await presence.apply(interaction.client);
      await interaction.reply({ content: `✅ Status set to Twitch streaming (${url}).`, flags: EPHEMERAL });
      return;
    }

    if (sub === 'set') {
      const status = interaction.options.getString('status');
      const activityType = interaction.options.getString('activity-type');
      const activityText = interaction.options.getString('activity-text');
      if (activityType && !activityText) {
        await interaction.reply({ content: '❌ `activity-text` is required when `activity-type` is set.', flags: EPHEMERAL });
        return;
      }
      presence.setManual({ status, activityType, activityText, setBy: who });
      await presence.apply(interaction.client);
      await interaction.reply({
        content:
          `✅ Bot status set to **${status}**${activityText ? ` (${activityType}: ${activityText})` : ''}.\n` +
          'ℹ️ Note: Discord presence belongs to the bot account and therefore applies to **all** servers at once ' +
          '(Discord does not support a different presence per server) - the most recently chosen setting wins.',
        flags: EPHEMERAL,
      });
    }
  },
};

module.exports = { botStatus, MENU_PREFIX, handleComponent, handleModal };
