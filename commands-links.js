'use strict';
const crypto = require('crypto');
const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder,
  ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const config = require('./config');
const storage = require('./storage');
const { EPHEMERAL } = require('./util');
const PREFIX = 'lnk:';

function defaults() {
  const entries = [
    { name: 'GalaxyBot Website', url: config.links.website },
    { name: 'NexVault Website', url: config.links.nexvault || 'https://nexvault.is-great.org/' },
    { name: 'Terms of Service', url: config.links.tos },
    { name: 'Privacy Policy', url: config.links.privacy },
  ];
  if (process.env.DISCORD_INVITE_URL) entries.unshift({ name: 'Join the Discord', url: process.env.DISCORD_INVITE_URL.trim() });
  return entries.filter(x => validUrl(x.url)).map(x => ({ id: crypto.randomBytes(5).toString('hex'), ...x }));
}
function validUrl(value) {
  try { const u = new URL(String(value)); return ['https:', 'http:'].includes(u.protocol); }
  catch { return false; }
}
function getLinks() {
  let links = storage.getMeta('botLinks');
  if (!Array.isArray(links)) {
    links = defaults();
    storage.setMeta('botLinks', links);
  }
  return links.filter(x => x && typeof x.name === 'string' && typeof x.url === 'string' && validUrl(x.url)).slice(0, 25);
}
function saveLinks(links) {
  storage.setMeta('botLinks', links.slice(0, 25));
}
function linksEmbed() {
  const links = getLinks();
  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('🔗 Useful Links')
    .setDescription(links.length ? links.map(x => `**→ ${x.name.replace(/[*_`]/g, '')}**\n${x.url}`).join('\n\n').slice(0, 4000) : 'No links have been configured yet.');
  return { embeds: [embed], allowedMentions: { parse: [] } };
}
const links = {
  data: new SlashCommandBuilder().setName('links').setDescription('Shows the server and project links'),
  async execute(interaction) {
    await interaction.reply(linksEmbed());
  },
};
function selectedLink(ownerId) {
  const selected = storage.getMeta('linkSelections') || {};
  const id = selected[ownerId];
  return getLinks().find(x => x.id === id) || null;
}
function setSelected(ownerId, id) {
  const selected = storage.getMeta('linkSelections') || {};
  selected[ownerId] = id;
  storage.setMeta('linkSelections', selected);
}
function panel(ownerId) {
  const all = getLinks();
  const selected = selectedLink(ownerId);
  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('🔗 Link Manager')
    .setDescription('Manage the public links displayed by `/links`. Changes are saved immediately.')
    .addFields({ name: 'Current links', value: all.length ? all.map((x, i) => `${i + 1}. **${x.name}** — ${x.url}`).join('\n').slice(0, 1024) : 'No links configured.' });
  if (selected) embed.addFields({ name: 'Selected link', value: `**${selected.name}**\n${selected.url}` });
  const rows = [];
  if (all.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId(`${PREFIX}select:${ownerId}`).setPlaceholder('Select a link to edit or delete')
    .addOptions(all.slice(0, 25).map(x => ({ label: x.name.slice(0, 100), value: x.id, description: x.url.slice(0, 100), default: selected?.id === x.id })))));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${PREFIX}add:${ownerId}`).setLabel('Add link').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${PREFIX}edit:${ownerId}`).setLabel('Edit selected').setStyle(ButtonStyle.Primary).setDisabled(!selected),
    new ButtonBuilder().setCustomId(`${PREFIX}delete:${ownerId}`).setLabel('Delete selected').setStyle(ButtonStyle.Danger).setDisabled(!selected),
  ));
  return { embeds: [embed], components: rows };
}

const linksManage = {
  data: new SlashCommandBuilder().setName('links-manage').setDescription('Manage the bot public links (bot owner, DM only)'),
  async execute(interaction) {
    if (!config.getBotOwnerIds().has(interaction.user.id)) return void await interaction.reply({ content: 'Bot owner only.' });
    if (interaction.inGuild()) return void await interaction.reply({ content: 'Please use `/links-manage` in a direct message with the bot.' });
    await interaction.reply(panel(interaction.user.id));
  },
};
function addLinkModal(ownerId) {
  const modal = new ModalBuilder().setCustomId(`${PREFIX}modal-add:${ownerId}`).setTitle('Add public link');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Display name').setStyle(TextInputStyle.Short).setMaxLength(80).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('url').setLabel('URL (http or https)').setStyle(TextInputStyle.Short).setMaxLength(512).setRequired(true)),
  );
  return modal;
}
function editLinkModal(ownerId, selected) {
  const modal = new ModalBuilder().setCustomId(`${PREFIX}modal-edit:${ownerId}`).setTitle('Edit public link');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Display name').setStyle(TextInputStyle.Short).setMaxLength(80).setRequired(true).setValue(selected.name)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('url').setLabel('URL (http or https)').setStyle(TextInputStyle.Short).setMaxLength(512).setRequired(true).setValue(selected.url)),
  );
  return modal;
}
async function handleComponent(interaction) {
  const [, action, ownerId] = interaction.customId.split(':');
  if (!config.getBotOwnerIds().has(interaction.user.id) || interaction.user.id !== ownerId || interaction.inGuild()) {
    return void await interaction.reply({ content: 'This control is restricted to the bot owner in DMs.' });
  }
  if (action === 'select' && interaction.isStringSelectMenu()) {
    setSelected(ownerId, interaction.values[0]);
    return void await interaction.update(panel(ownerId));
  }
  if (action === 'add' && interaction.isButton()) return void await interaction.showModal(addLinkModal(ownerId));
  if (action === 'edit' && interaction.isButton()) {
    const selected = selectedLink(ownerId);
    if (!selected) return void await interaction.update(panel(ownerId));
    return void await interaction.showModal(editLinkModal(ownerId, selected));
  }
  if (action === 'delete' && interaction.isButton()) {
    const selected = selectedLink(ownerId);
    if (selected) saveLinks(getLinks().filter(x => x.id !== selected.id));
    setSelected(ownerId, null);
    return void await interaction.update(panel(ownerId));
  }
  if (action.startsWith('modal-') && interaction.isModalSubmit()) {
    const name = interaction.fields.getTextInputValue('name').trim();
    const url = interaction.fields.getTextInputValue('url').trim();
    if (!name || name.length > 80 || !validUrl(url)) {
      return void await interaction.reply({ content: 'Invalid input. Provide a name and a valid `https://` or `http://` URL.' });
    }
    const all = getLinks();
    if (action === 'modal-add') {
      if (all.length >= 25) return void await interaction.reply({ content: 'The current Discord menu supports up to 25 links. Delete one before adding another.' });
      const entry = { id: crypto.randomBytes(5).toString('hex'), name, url };
      all.push(entry);
      saveLinks(all);
      setSelected(ownerId, entry.id);
    } else {
      const selected = selectedLink(ownerId);
      if (!selected) return void await interaction.reply({ content: 'The selected link no longer exists. Reopen `/links-manage`.' });
      saveLinks(all.map(x => x.id === selected.id ? { ...x, name, url } : x));
    }
    return void await interaction.reply({ content: '✅ Link saved.' , ...panel(ownerId) });
  }
}
linksManage.dmOnly = true;
module.exports = { links, linksManage, handleComponent, PREFIX, getLinks };
