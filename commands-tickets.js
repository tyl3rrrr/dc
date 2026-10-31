'use strict';
const { SlashCommandBuilder } = require('discord.js');
const ticketRuntime = require('./ticket-runtime');
const { EPHEMERAL } = require('./util');
const OPEN_BUTTON_ID = 'ticket_open';
const CLOSE_BUTTON_ID = 'ticket_close';

const ticket = {
  data: new SlashCommandBuilder().setName('ticket').setDescription('Create a private support ticket')
    .addStringOption(option => option.setName('message').setDescription('Describe your issue (optional)').setMaxLength(1500).setRequired(false)),
  async execute(interaction) {
    await interaction.deferReply({ flags: EPHEMERAL });
    const result = await ticketRuntime.begin(interaction.user, interaction.guild, interaction.options.getString('message') || '');
    await interaction.editReply(result.ok ? `✅ Your private ticket has been created: ${result.channel}` : `❌ ${result.error}`);
  },
};
const ticketClose = {
  data: new SlashCommandBuilder().setName('ticket-close').setDescription('Close the current private ticket'),
  async execute(interaction) {
    if (!interaction.inGuild()) return void await interaction.reply({ content: 'Use this command inside your private ticket channel.', flags: EPHEMERAL });
    await ticketRuntime.closeFromInteraction(interaction);
  },
};
async function handleOpenTicket(interaction) {
  await ticketRuntime.handleOpenTicket(interaction);
}
async function handleCloseTicket(interaction) {
  await ticketRuntime.handleCloseTicket(interaction);
}
module.exports = { ticket, ticketClose, OPEN_BUTTON_ID, CLOSE_BUTTON_ID, handleOpenTicket, handleCloseTicket };
