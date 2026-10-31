'use strict';
const fs = require('fs');
const path = require('path');
const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder,
  ButtonBuilder, ButtonStyle, AttachmentBuilder,
} = require('discord.js');
const config = require('./config');
const storage = require('./storage');
const botlog = require('./botlog');
const { redactSecrets, truncate } = require('./util');
const PREFIX = 'ownerui:';
const INSPECT_PREFIX = 'oi:';
const PAGE_SIZE = 25;
function isOwner(userId) { return config.getBotOwnerIds().has(userId); }

const login = {
  data: new SlashCommandBuilder().setName('login').setDescription('Open the bot owner control center (DM only)'),
  async execute(i) {
    if (!isOwner(i.user.id)) return void await i.reply({ content: 'Bot owner only.' });
    if (i.inGuild()) return void await i.reply({ content: 'Please use `/login` in a direct message with the bot.' });
    const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('🌌 GalaxyBot Owner Control Center')
      .setDescription('Private control center for operational status, server overview, logs and configuration exports.')
      .addFields(
        { name: 'Status', value: `Uptime: ${Math.floor(process.uptime() / 60)} minutes\nServers: ${i.client.guilds.cache.size}\nNode.js: ${process.version}`, inline: true },
        { name: 'Operations', value: 'Bot logs, server list, non-secret configuration backup and source inspection.', inline: true },
      );
    const menu = new StringSelectMenuBuilder().setCustomId(`${PREFIX}menu`).setPlaceholder('Choose an owner action').addOptions(
      { label: 'Bot status', value: 'status' },
      { label: 'Server overview', value: 'guilds' },
      { label: 'Bot logs', value: 'logs' },
      { label: 'Configuration backup', value: 'backup' },
    );
    await i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
  },
};

function sourceFiles() {
  const root = path.resolve(__dirname);
  const excludedDirs = new Set(['node_modules', '.git', '.github', 'storage']);
  const excludedFiles = new Set(['.env', 'data.json', 'bot.lock', 'bot.log']);
  const allowedExt = new Set(['.js', '.json', '.md', '.txt', '.yml', '.yaml', '.php', '.css', '.html', '.sql', '.htaccess', '.example']);
  const out = [];
  function walk(dir) {
    let items;
    try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const item of items) {
      if (item.isDirectory()) {
        if (excludedDirs.has(item.name) || item.name.startsWith('.')) continue;
        walk(path.join(dir, item.name));
      } else if (item.isFile()) {
        if (excludedFiles.has(item.name) || (item.name.startsWith('.env') && item.name !== '.env.example') || item.name.endsWith('.log') || item.name.endsWith('.zip')) continue;
        const full = path.join(dir, item.name);
        const rel = path.relative(root, full).split(path.sep).join('/');
        const ext = item.name === '.htaccess' ? '.htaccess' : path.extname(item.name).toLowerCase();
        if (allowedExt.has(ext) && !rel.startsWith('website/storage/')) out.push(rel);
      }
    }
  }
  walk(root);
  return out.sort();
}
function sanitizeInspectableFile(relative, input) {
  let output = redactSecrets(input);
  // Never expose the live database credentials from the preserved InfinityFree config.php.
  if (relative.endsWith('/config.php') || relative === 'config.php') {
    output = output.replace(/(define\(['"](?:DB_HOST|DB_NAME|DB_USER|DB_PASS)['"]\s*,\s*getenv\(['"][^'"]+['"]\)\s*\?:\s*)('[^']*'|"[^"]*")/gi, '$1\'[redacted: use the unchanged original config.php on the website host]\'');
  }
  return output;
}
function inspectPanel(ownerId, page = 0, notice = '') {
  const all = sourceFiles();
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const current = Math.max(0, Math.min(Number(page) || 0, pages - 1));
  const items = all.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('🗂️ Project Source Inspector')
    .setDescription('Browse the bot and bundled NexVault website source. Runtime databases, uploads, `.env` and raw credentials are not exported. SQL connection placeholders in the inspection copy are redacted; your original website `config.php` remains unchanged.')
    .setFooter({ text: `Page ${current + 1}/${pages} · ${all.length} source files` });
  if (notice) embed.addFields({ name: 'Latest action', value: notice.slice(0, 900) });
  const rows = [];
  if (items.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId(`${INSPECT_PREFIX}file:${ownerId}:${current}`).setPlaceholder('Select a source file')
    .addOptions(items.map(file => ({ label: file.split('/').pop().slice(0, 100), value: file.slice(0, 100), description: file.slice(0, 100) })))));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${INSPECT_PREFIX}page:${ownerId}:${current - 1}`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(current <= 0),
    new ButtonBuilder().setCustomId(`${INSPECT_PREFIX}page:${ownerId}:${current + 1}`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(current >= pages - 1),
  ));
  return { embeds: [embed], components: rows };
}
const ownerInspect = {
  data: new SlashCommandBuilder().setName('owner-inspect').setDescription('Browse project source files (bot owner, DM only)'),
  async execute(i) {
    if (!isOwner(i.user.id)) return void await i.reply({ content: 'Bot owner only.' });
    if (i.inGuild()) return void await i.reply({ content: 'Please use `/owner-inspect` in a direct message with the bot.' });
    await i.reply(inspectPanel(i.user.id));
  },
};

async function handleInspectComponent(i) {
  const [, action, ownerId, pageText] = i.customId.split(':');
  if (!isOwner(i.user.id) || i.user.id !== ownerId || i.inGuild()) return void await i.reply({ content: 'This source inspector is restricted to the bot owner in DMs.' });
  const page = Number(pageText) || 0;
  if (action === 'page' && i.isButton()) return void await i.update(inspectPanel(ownerId, page));
  if (action === 'file' && i.isStringSelectMenu()) {
    const relative = i.values[0];
    if (!sourceFiles().includes(relative)) return void await i.reply({ content: 'File is no longer available. Refresh the inspector.' });
    const root = path.resolve(__dirname);
    const full = path.resolve(root, relative);
    if (!full.startsWith(root + path.sep)) return void await i.reply({ content: 'Invalid source path.' });
    try {
      const original = await fs.promises.readFile(full, 'utf8');
      const content = sanitizeInspectableFile(relative, original);
      const buffer = Buffer.from(content, 'utf8');
      if (buffer.length > 7_500_000) return void await i.reply({ content: 'This file is too large to send as a Discord attachment.' });
      const safeName = relative.replace(/[^\w./-]/g, '_').replaceAll('/', '__').slice(0, 90);
      await i.reply({ content: `Source file: ${relative}`, files: [new AttachmentBuilder(buffer, { name: `${safeName}.txt` })] });
    } catch (error) {
      await i.reply({ content: `Could not read this file: ${String(error.message || error).slice(0, 300)}` });
    }
  }
}

async function handleComponent(i) {
  if (!isOwner(i.user.id) || i.inGuild()) return void await i.reply({ content: 'Owner DM only.' });
  const action = i.customId.slice(PREFIX.length);
  if (action === 'menu') {
    const choice = i.values[0];
    if (choice === 'status') return void await i.update({ content: `**GalaxyBot Status**\nUptime: ${Math.floor(process.uptime() / 3600)} h ${Math.floor(process.uptime() / 60) % 60} min\nRAM RSS: ${(process.memoryUsage().rss / 1048576).toFixed(1)} MB\nServers: ${i.client.guilds.cache.size}\nLoaded commands: ${i.client.commands?.size ?? 'unknown'}`, embeds: [], components: [] });
    if (choice === 'guilds') {
      const lines = i.client.guilds.cache.map(g => `${g.name} | ${g.id} | ${g.memberCount ?? '?'} members`);
      return void await i.update({ content: truncate(lines.join('\n') || 'No servers cached.', 1900), embeds: [], components: [] });
    }
    if (choice === 'logs') {
      const logs = await botlog.readRecent?.(30);
      return void await i.update({ content: truncate(JSON.stringify(logs || { message: 'Use /config bot-logs for recent activity logs.' }, null, 2), 1900), embeds: [], components: [] });
    }
    if (choice === 'backup') {
      const guildSettings = {};
      for (const guild of i.client.guilds.cache.values()) guildSettings[guild.id] = storage.getGuildSettings(guild.id);
      const data = redactSecrets(JSON.stringify(guildSettings, null, 2));
      return void await i.reply({ content: 'Non-secret server configuration export:', files: [new AttachmentBuilder(Buffer.from(data), { name: 'galaxybot-config-backup.json' })] });
    }
  }
}
login.dmOnly = true;
ownerInspect.dmOnly = true;
module.exports = { login, ownerInspect, handleComponent, handleInspectComponent, PREFIX, INSPECT_PREFIX };
