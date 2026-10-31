'use strict';
const { SlashCommandBuilder, ChannelType, EmbedBuilder } = require('discord.js');
const storage = require('./storage');
const { EPHEMERAL } = require('./util');

const ticketConfig = {
  data: new SlashCommandBuilder().setName('ticket-config').setDescription('Configure private tickets and the AI support assistant')
    .addSubcommand(sub => sub.setName('category').setDescription('Set the category where private ticket channels are created')
      .addChannelOption(option => option.setName('category').setDescription('Ticket category').addChannelTypes(ChannelType.GuildCategory).setRequired(true)))
    .addSubcommand(sub => sub.setName('staff').setDescription('Set the role that can view and claim tickets')
      .addRoleOption(option => option.setName('role').setDescription('Support staff role').setRequired(true)))
    .addSubcommand(sub => sub.setName('knowledge').setDescription('Set the server knowledge used by Gemini (max 1000 characters)')
      .addStringOption(option => option.setName('text').setDescription('Support policies, common fixes, links and instructions').setMaxLength(1000).setRequired(true)))
    .addSubcommand(sub => sub.setName('ai').setDescription('Enable or disable Gemini replies in tickets')
      .addBooleanOption(option => option.setName('enabled').setDescription('Whether AI support should answer customer messages').setRequired(true)))
    .addSubcommand(sub => sub.setName('view').setDescription('Show the current ticket configuration')),
  async execute(interaction) {
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();
    if (sub === 'category') {
      const category = interaction.options.getChannel('category', true);
      storage.setGuildSetting(guildId, 'ticketCategoryId', category.id);
      await interaction.reply({ content: `✅ Private ticket channels will be created in **${category.name}**.`, flags: EPHEMERAL });
      return;
    }
    if (sub === 'staff') {
      const role = interaction.options.getRole('role', true);
      storage.setGuildSetting(guildId, 'ticketStaffRoleId', role.id);
      await interaction.reply({ content: `✅ ${role} can now view and claim private tickets.`, flags: EPHEMERAL, allowedMentions: { parse: [] } });
      return;
    }
    if (sub === 'knowledge') {
      const text = interaction.options.getString('text', true).trim();
      storage.setGuildSetting(guildId, 'ticketKnowledge', text);
      await interaction.reply({ content: '✅ The support knowledge base has been saved. Gemini will use it when answering tickets.', flags: EPHEMERAL });
      return;
    }
    if (sub === 'ai') {
      const enabled = interaction.options.getBoolean('enabled', true);
      storage.setGuildSetting(guildId, 'ticketAIEnabled', enabled);
      await interaction.reply({ content: `✅ AI ticket replies are now **${enabled ? 'enabled' : 'disabled'}** for this server.`, flags: EPHEMERAL });
      return;
    }
    const settings = storage.getGuildSettings(guildId);
    const category = settings.ticketCategoryId ? interaction.guild.channels.cache.get(settings.ticketCategoryId) : null;
    const role = settings.ticketStaffRoleId ? interaction.guild.roles.cache.get(settings.ticketStaffRoleId) : null;
    const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('🎫 Ticket Configuration')
      .addFields(
        { name: 'Ticket category', value: category ? category.name : 'Not configured', inline: true },
        { name: 'Staff role', value: role ? role.name : 'Not configured', inline: true },
        { name: 'Gemini AI', value: settings.ticketAIEnabled === false ? 'Disabled' : (process.env.GEMINI_KEY ? 'Enabled (API key present)' : 'Enabled (GEMINI_KEY missing)'), inline: true },
        { name: 'Knowledge base', value: settings.ticketKnowledge ? `${settings.ticketKnowledge.slice(0, 900)}${settings.ticketKnowledge.length > 900 ? '…' : ''}` : 'No server-specific information added yet.' },
      );
    await interaction.reply({ embeds: [embed], flags: EPHEMERAL });
  },
};
module.exports = { ticketConfig };
