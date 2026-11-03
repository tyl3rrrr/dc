'use strict';
const { SlashCommandBuilder, ChannelType, EmbedBuilder } = require('discord.js');
const storage = require('./storage');
const { EPHEMERAL } = require('./util');

const ticketConfig = {
  data: new SlashCommandBuilder().setName('ticket-config').setDescription('Configure private support tickets')
    .addSubcommand(sub => sub.setName('category').setDescription('Set the category where private ticket channels are created')
      .addChannelOption(option => option.setName('category').setDescription('Ticket category').addChannelTypes(ChannelType.GuildCategory).setRequired(true)))
    .addSubcommand(sub => sub.setName('staff').setDescription('Set the role that can view and claim tickets')
      .addRoleOption(option => option.setName('role').setDescription('Support staff role').setRequired(true)))
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
      await interaction.reply({ content: `✅ ${role} can now view and claim tickets.`, flags: EPHEMERAL, allowedMentions: { parse: [] } });
      return;
    }
    const settings = storage.getGuildSettings(guildId);
    const category = settings.ticketCategoryId ? interaction.guild.channels.cache.get(settings.ticketCategoryId) : null;
    const role = settings.ticketStaffRoleId ? interaction.guild.roles.cache.get(settings.ticketStaffRoleId) : null;
    const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('🎫 Ticket Configuration')
      .addFields(
        { name: 'Ticket category', value: category ? category.name : 'Not configured', inline: true },
        { name: 'Staff role', value: role ? role.name : 'Not configured', inline: true },
        { name: 'Ticket handling', value: 'Responses are handled manually by the assigned support staff.' },
      );
    await interaction.reply({ embeds: [embed], flags: EPHEMERAL });
  },
};
module.exports = { ticketConfig };
