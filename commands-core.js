// commands-core.js
const os = require('os');
const { SlashCommandBuilder, EmbedBuilder, version: djsVersion } = require('discord.js');

const config = require('./config');
const pkg = require('./package.json');
const { EPHEMERAL } = require('./util');
const nexvault = require('./nexvault');

function formatUptime(ms) {
  let totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  totalSeconds -= days * 86400;
  const hours = Math.floor(totalSeconds / 3600);
  totalSeconds -= hours * 3600;
  const minutes = Math.floor(totalSeconds / 60);
  totalSeconds -= minutes * 60;
  const seconds = totalSeconds;

  const parts = [];
  if (days > 0) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  parts.push(`${seconds} second${seconds === 1 ? '' : 's'}`);
  return parts.join(', ');
}

const uptime = {
  data: new SlashCommandBuilder().setName('uptime').setDescription('Shows how long the bot has been running'),
  async execute(interaction) {
    // Process uptime: starts at 0 again on every bot restart AND after the
    // host is powered off/on (see config.js).
    await interaction.reply(`⏱️ Uptime: ${formatUptime(config.getUptimeMs())}`);
  },
};

const status = {
  data: new SlashCommandBuilder().setName('status').setDescription('Checks the project websites and NexVault API'),
  async execute(interaction) {
    await interaction.deferReply();
    const websiteUrl = config.links.website;
    const websiteCheck = (async () => {
      const started = Date.now();
      try {
        const response = await fetch(websiteUrl, { method: 'GET', signal: AbortSignal.timeout(6000), redirect: 'follow' });
        return { ok: response.ok, code: response.status, latency: Date.now() - started, error: null };
      } catch (error) {
        return { ok: false, code: null, latency: Date.now() - started, error: error.name === 'AbortError' ? 'Timed out after 6 seconds' : String(error.message || error).slice(0, 250) };
      }
    })();
    const apiConfigured = Boolean(String(process.env.NEXVAULT_API_URL || '').trim() && String(process.env.NEXVAULT_API_KEY || '').trim());
    const [website, nv] = await Promise.all([
      websiteCheck,
      apiConfigured ? nexvault.websiteStatus() : Promise.resolve(null),
    ]);

    const embed = new EmbedBuilder()
      .setTitle('🌐 Service Status')
      .setColor(website.ok && (!nv || nv.ok) ? 0x57f287 : 0xfee75c)
      .addFields(
        { name: 'GalaxyBot Website', value: `${website.ok ? '🟢 Reachable' : '🔴 Unreachable'}\nURL: ${websiteUrl}\nHTTP: ${website.code ?? 'n/a'}\nLatency: ${website.latency} ms${website.error ? `\nError: ${website.error}` : ''}`.slice(0, 1024) },
      )
      .setTimestamp();

    if (apiConfigured) {
      embed.addFields({
        name: 'NexVault API',
        value: nv?.ok
          ? `🟢 Online\nLatency: ${nv.latency} ms\nCategories: ${nv.categories}\nAvailable codes: ${nv.available}`
          : `🔴 Offline / blocked\nLatency: ${nv?.latency ?? 'n/a'} ms\n${String(nv?.error || 'Unknown API error').slice(0, 700)}`,
      });
    } else {
      embed.addFields({ name: 'NexVault API', value: '⚪ Not configured — set `NEXVAULT_API_URL` and `NEXVAULT_API_KEY` in `.env`.' });
    }
    await interaction.editReply({ embeds: [embed] });
  },
};

const reloadCmd = {
  // Access (bot operator only) is checked centrally in permissions.js (access: 'bot-owner').
  data: new SlashCommandBuilder().setName('reload').setDescription('Reloads the .env without restarting the bot'),
  async execute(interaction) {
    try {
      config.reloadAll();
      await interaction.reply({ content: '✅ Configuration reloaded (.env).', flags: EPHEMERAL });
    } catch (err) {
      console.error('Error reloading the configuration:', err);
      await interaction.reply({ content: '❌ Error reloading the configuration.', flags: EPHEMERAL });
    }
  },
};

const botinfo = {
  data: new SlashCommandBuilder().setName('botinfo').setDescription('Shows technical information about the bot'),
  async execute(interaction) {
    const client = interaction.client;
    const mem = process.memoryUsage();
    const uptimeMs = config.getUptimeMs();
    const embed = new EmbedBuilder()
      .setTitle('🤖 Bot Info')
      .setColor(0x5865f2)
      .addFields(
        { name: 'Bot version', value: pkg.version || 'unknown', inline: true },
        { name: 'discord.js', value: djsVersion, inline: true },
        { name: 'Node.js', value: process.version, inline: true },
        { name: 'Server', value: String(client.guilds.cache.size), inline: true },
        { name: 'RAM usage', value: `${(mem.rss / 1024 / 1024).toFixed(1)} MB`, inline: true },
        { name: 'Platform', value: `${os.platform()} (${os.arch()})`, inline: true },
        { name: 'Process', value: `PID ${process.pid} @ ${os.hostname()}`.slice(0, 1000), inline: true },
        { name: 'Uptime', value: formatUptime(uptimeMs), inline: true }
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};

module.exports = {
  uptime,
  status,
  reload: reloadCmd,
  botinfo,
};
