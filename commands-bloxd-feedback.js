'use strict';

const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');
const feedbackRuntime = require('./bloxd-feedback-runtime');

const bloxdFeedback = {
  data: new SlashCommandBuilder()
    .setName('feedback-bloxdatlas')
    .setDescription('Set the Discord channel for BloxdAtlas feedback embeds')
    .addChannelOption(option => option
      .setName('channel')
      .setDescription('Text channel that receives new BloxdAtlas feedback')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)),
  async execute(interaction) {
    const channel = interaction.options.getChannel('channel', true);
    if (!interaction.guild || channel.type !== ChannelType.GuildText) {
      return interaction.reply({ content: 'Please choose a server text channel.', ephemeral: true });
    }
    const me = interaction.guild.members.me;
    const permissions = me ? channel.permissionsFor(me) : null;
    const required = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks
    ];
    if (!permissions || !required.every(bit => permissions.has(bit))) {
      return interaction.reply({
        content: 'I need View Channel, Send Messages and Embed Links permissions in that channel.',
        ephemeral: true
      });
    }
    try {
      feedbackRuntime.setChannelId(channel.id);
      const confirmation = new EmbedBuilder()
        .setColor(0xffb454)
        .setTitle('BloxdAtlas feedback channel configured')
        .setDescription(`New feedback from the BloxdAtlas website will be posted here: ${channel}`)
        .setFooter({ text: 'Only the bot owner can change this destination.' });
      return interaction.reply({ embeds: [confirmation], ephemeral: true });
    } catch (error) {
      return interaction.reply({ content: `Could not save the feedback channel: ${error.message}`, ephemeral: true });
    }
  }
};

module.exports = { bloxdFeedback };
