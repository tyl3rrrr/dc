'use strict';
const {
  ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const storage = require('./storage');
const permissions = require('./permissions');
const logging = require('./logging');
const { truncate, errText } = require('./util');

const PREFIX = 'tkt:';
const MARKER = 'galaxy-ticket|';
const TEXT = {
  done: 'Your ticket has been created. Please continue in the private ticket channel.',
  cancelled: 'Ticket closed.',
};

function ticketData(channel) {
  const topic = String(channel?.topic || '');
  if (!topic.startsWith(MARKER)) return null;
  const values = Object.fromEntries(topic.slice(MARKER.length).split('|').map(part => {
    const idx = part.indexOf('=');
    return idx < 0 ? [part, ''] : [part.slice(0, idx), part.slice(idx + 1)];
  }));
  return { ownerId: values.owner || null, number: Number(values.number || 0), claimedBy: values.claimed || null, escalated: values.escalated === '1' };
}
function topicFor(data) {
  return `${MARKER}owner=${data.ownerId}|number=${data.number}|claimed=${data.claimedBy || ''}|escalated=${data.escalated ? 1 : 0}|created=${data.createdAt || Date.now()}`.slice(0, 1024);
}
function configuredStaffRoles(guild, settings) {
  return [...new Set([settings.ticketStaffRoleId, settings.adminRoleId, settings.modRoleId].filter(id => id && guild.roles.cache.has(id)))];
}
function isStaff(guild, member, settings) {
  if (!member) return false;
  if (guild.ownerId === member.id) return true;
  if (member.permissions?.has(PermissionFlagsBits.Administrator) || member.permissions?.has(PermissionFlagsBits.ManageChannels)) return true;
  if (configuredStaffRoles(guild, settings).some(id => member.roles?.cache?.has(id))) return true;
  return permissions.getMemberLevel(guild, member) >= permissions.LEVEL.MOD;
}
function ticketControls(channelId, claimed = false) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${PREFIX}close:${channelId}`).setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`${PREFIX}claim:${channelId}`).setLabel(claimed ? 'Claimed' : 'Claim').setEmoji('✋').setStyle(ButtonStyle.Success).setDisabled(claimed),
  )];
}
function checkSetup(guild) {
  if (!guild) return { ok: false, error: 'Tickets can only be opened in a server.' };
  const me = guild.members.me;
  if (me && !me.permissions.has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
    return { ok: false, error: 'I need Manage Channels, View Channels and Send Messages to create private tickets.' };
  }
  const settings = storage.getGuildSettings(guild.id);
  if (settings.ticketCategoryId) {
    const category = guild.channels.cache.get(settings.ticketCategoryId);
    if (!category || category.type !== ChannelType.GuildCategory) return { ok: false, error: 'The configured ticket category no longer exists. Update it with `/ticket-config category`.' };
  }
  if (settings.ticketStaffRoleId && !guild.roles.cache.has(settings.ticketStaffRoleId)) {
    return { ok: false, error: 'The configured ticket staff role no longer exists. Update it with `/ticket-config staff`.' };
  }
  return { ok: true };
}

async function createTicket(client, guild, user, messageText = '') {
  const setup = checkSetup(guild);
  if (!setup.ok) return setup;
  const settings = storage.getGuildSettings(guild.id);
  const number = storage.nextTicketNumber(guild.id);
  const category = settings.ticketCategoryId ? guild.channels.cache.get(settings.ticketCategoryId) : null;
  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
  ];
  if (botMember) overwrites.push({ id: botMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles] });
  for (const roleId of configuredStaffRoles(guild, settings)) {
    overwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] });
  }

  let channel;
  try {
    channel = await guild.channels.create({
      name: `ticket-${String(number).padStart(3, '0')}`.slice(0, 90),
      type: ChannelType.GuildText,
      parent: category?.id || undefined,
      topic: topicFor({ ownerId: user.id, number, createdAt: Date.now(), escalated: false }),
      permissionOverwrites: overwrites,
      reason: `Private support ticket #${number} opened by ${user.tag || user.id}`,
    });
  } catch (error) {
    console.warn(`Ticket channel creation failed in ${guild.id}:`, errText(error));
    return { ok: false, error: 'I could not create a private ticket channel. Please check my Manage Channels permission and the configured category.' };
  }

  const greeting = 'Please describe your issue in detail. A member of the support team will reply here as soon as possible.';
  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(`Welcome to #${channel.name}!`)
    .setDescription(greeting)
    .addFields(
      { name: 'Category', value: String(settings.ticketCategoryLabel || 'General Support').slice(0, 100), inline: true },
      { name: 'Opened', value: 'Just now', inline: true },
      { name: 'Created by', value: `<@${user.id}>`, inline: true },
    ).setFooter({ text: `Ticket #${number}` }).setTimestamp();
  try {
    await channel.send({
      content: `<@${user.id}>`, embeds: [embed], components: ticketControls(channel.id),
      allowedMentions: { users: [user.id] },
    });
    if (messageText.trim()) {
      const firstMessage = truncate(messageText.trim(), 1500);
      await channel.send({ content: `<@${user.id}> ${firstMessage}`, allowedMentions: { users: [user.id] } });
    }
  } catch (error) {
    await channel.delete('Ticket setup message failed').catch(() => {});
    console.warn(`Ticket greeting failed in ${guild.id}:`, errText(error));
    return { ok: false, error: 'The private channel was created but I could not finish its setup. Please try again.' };
  }
  logging.logToGuild(client, guild.id, { title: '🎫 Ticket created', fields: [
    { name: 'Ticket', value: `#${number}`, inline: true },
    { name: 'User', value: `${user.tag || user.username} (${user.id})`, inline: true },
    { name: 'Channel', value: `<#${channel.id}>`, inline: true },
  ] });
  return { ok: true, number, channel };
}

async function begin(user, guild, messageText = '') {
  return createTicket(guild.client, guild, user, messageText);
}
async function deliver(client, guildId, user, payload = {}) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return { ok: false, error: 'This server is no longer available.' };
  const content = String(payload.content || '').trim();
  const result = await createTicket(client, guild, user, content);
  if (!result.ok) return result;
  // Re-upload supported files into the private ticket channel.
  const attachments = [...(payload.attachments || [])].slice(0, 5);
  for (const attachment of attachments) {
    try {
      const response = await fetch(attachment.url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) continue;
      const data = Buffer.from(await response.arrayBuffer());
      const max = guild.maximumUploadLimit || 10 * 1024 * 1024;
      if (data.length > max) continue;
      await result.channel.send({ files: [{ attachment: data, name: String(attachment.name || 'attachment').replace(/[^\w.-]/g, '_').slice(0, 90) }] });
    } catch (err) { console.warn('Ticket attachment could not be copied:', errText(err)); }
  }
  return result;
}

async function handleGuildMessage(message) {
  // Keep ticket conversations inside their private ticket channel. Staff now answer manually.
  return Boolean(ticketData(message.channel));
}

async function handleTicketComponent(interaction) {
  const [, action, channelId] = interaction.customId.split(':');
  const channel = interaction.channel;
  if (!channel || channel.id !== channelId || !channel.guild) return void await interaction.reply({ content: 'This ticket channel is no longer available.', ephemeral: true });
  const record = ticketData(channel);
  if (!record) return void await interaction.reply({ content: 'This is not an active ticket channel.', ephemeral: true });
  const settings = storage.getGuildSettings(channel.guild.id);
  const member = interaction.member;
  const staff = isStaff(channel.guild, member, settings);
  if (action === 'claim') {
    if (!staff) return void await interaction.reply({ content: 'Only the support team can claim this ticket.', ephemeral: true });
    if (record.claimedBy && record.claimedBy !== interaction.user.id) return void await interaction.reply({ content: `This ticket has already been claimed by <@${record.claimedBy}>.`, ephemeral: true });
    await interaction.deferUpdate();
    await channel.setTopic(topicFor({ ...record, claimedBy: interaction.user.id, createdAt: Date.now() }));
    await interaction.editReply({ components: ticketControls(channel.id, true) });
    await channel.send({ content: `✋ This ticket is now claimed by <@${interaction.user.id}>.`, allowedMentions: { users: [interaction.user.id] } });
    return;
  }
  if (action === 'close') {
    if (interaction.user.id !== record.ownerId && !staff) return void await interaction.reply({ content: 'Only the ticket creator or support staff can close this ticket.', ephemeral: true });
    await interaction.reply({ content: '🔒 This ticket will be closed in 5 seconds.', ephemeral: true });
    logging.logToGuild(interaction.client, channel.guild.id, { title: '🔒 Ticket closed', fields: [
      { name: 'Channel', value: channel.name, inline: true }, { name: 'Closed by', value: interaction.user.tag, inline: true },
    ] });
    setTimeout(() => channel.delete('Ticket closed by user or staff').catch(() => {}), 5000);
  }
}
async function closeFromInteraction(interaction) {
  const record = ticketData(interaction.channel);
  if (!record) return void await interaction.reply({ content: 'Use this command inside your private ticket channel.', ephemeral: true });
  const settings = storage.getGuildSettings(interaction.guildId);
  if (interaction.user.id !== record.ownerId && !isStaff(interaction.guild, interaction.member, settings)) {
    return void await interaction.reply({ content: 'Only the ticket creator or support staff can close this ticket.', ephemeral: true });
  }
  await interaction.reply({ content: '🔒 This ticket will be closed in 5 seconds.', ephemeral: true });
  setTimeout(() => interaction.channel.delete('Ticket closed using /ticket-close').catch(() => {}), 5000);
}
async function handleOpenTicket(interaction) {
  if (!interaction.inGuild() || !interaction.guild) return void await interaction.reply({ content: 'Tickets can only be opened in a server.', ephemeral: true });
  await interaction.deferReply({ ephemeral: true });
  const result = await begin(interaction.user, interaction.guild);
  await interaction.editReply(result.ok ? `✅ Your private ticket is ready: ${result.channel}` : `❌ ${result.error}`);
}
async function handleCloseTicket(interaction) {
  const record = ticketData(interaction.channel);
  if (!record) return void await interaction.reply({ content: 'This legacy ticket button is no longer connected to a ticket channel.', ephemeral: true });
  const settings = storage.getGuildSettings(interaction.guildId);
  if (interaction.user.id !== record.ownerId && !isStaff(interaction.guild, interaction.member, settings)) {
    return void await interaction.reply({ content: 'Only the ticket creator or support staff can close this ticket.', ephemeral: true });
  }
  await interaction.reply({ content: '🔒 This ticket will be closed in 5 seconds.', ephemeral: true });
  setTimeout(() => interaction.channel.delete('Ticket closed').catch(() => {}), 5000);
}
async function handleDM() { return false; }
function cancel() { return false; }
function hasSession() { return false; }

module.exports = { PREFIX, TEXT, checkSetup, begin, deliver, handleDM, handleGuildMessage, handleTicketComponent, closeFromInteraction, handleOpenTicket, handleCloseTicket, ticketData, isStaff, cancel, hasSession };
