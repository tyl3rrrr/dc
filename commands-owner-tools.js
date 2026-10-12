// Owner-only source inspection tool. Intentionally DM-only and allowlisted: secrets,
// .env files, tokens, runtime databases and user data are never exported.
const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const permissions = require('./permissions');
const { EPHEMERAL } = require('./util');

const ALLOWED = [
  'index.js', 'commands.js', 'commands-config.js', 'commands-ai.js', 'commands-admin.js',
  'commands-core.js', 'commands-mod.js', 'commands-settings.js', 'ai.js', 'ai-runtime.js',
  'botlog.js', 'logging.js', 'permissions.js', 'storage.js', 'config.js', 'dashboard-bridge.js',
  'deploy-commands.js', 'package.json', 'README.md', 'dashboard/README-DASHBOARD.md',
  'dashboard/supabase/functions/dashboard-api/index.ts', 'dashboard/supabase/migrations/202610090001_dashboard.sql'
];
const ownerInspect = {
  data: new SlashCommandBuilder().setName('owner-inspect').setDescription('Bot owner only: choose a project source file to inspect'),
  async execute(interaction) {
    if (!permissions.isBotOwner(interaction.user.id)) return void await interaction.reply({ content: '❌ Only the bot owner can use this command.', flags: EPHEMERAL });
    if (interaction.inGuild()) return void await interaction.reply({ content: '🔒 For security, `/owner-inspect` only works in a direct message with the bot.', flags: EPHEMERAL });
    const menu = new StringSelectMenuBuilder().setCustomId('ownerinspect_file').setPlaceholder('Choose a project file…').setMinValues(1).setMaxValues(1)
      .addOptions(ALLOWED.map(file => ({ label: file.split('/').pop().slice(0, 100), value: file, description: file.slice(0, 100) })));
    await interaction.reply({ content: '🔐 **Owner source viewer**\nSelect a file to receive it as a `.txt` attachment. Secrets, `.env`, tokens and runtime data files are excluded.', components: [new ActionRowBuilder().addComponents(menu)], flags: EPHEMERAL });
    const message = await interaction.fetchReply();
    const collector = message.createMessageComponentCollector({ time: 5 * 60 * 1000, filter: i => i.user.id === interaction.user.id && i.customId === 'ownerinspect_file' });
    collector.on('collect', async i => {
      const relative = i.values[0];
      if (!ALLOWED.includes(relative)) return void await i.reply({ content: '❌ File not allowed.', flags: EPHEMERAL });
      const full = path.resolve(__dirname, relative);
      if (!full.startsWith(path.resolve(__dirname) + path.sep)) return void await i.reply({ content: '❌ Invalid path.', flags: EPHEMERAL });
      try {
        const text = await fs.promises.readFile(full, 'utf8');
        const attachment = new AttachmentBuilder(Buffer.from(text, 'utf8'), { name: `${path.basename(relative)}.txt` });
        await i.reply({ content: `📄 Source file: ${relative}`, files: [attachment], flags: EPHEMERAL });
      } catch {
        await i.reply({ content: '❌ Could not read that file on the bot host.', flags: EPHEMERAL });
      }
    });
    collector.on('end', () => interaction.editReply({ components: [] }).catch(() => {}));
  }
};
module.exports = { ownerInspect };
