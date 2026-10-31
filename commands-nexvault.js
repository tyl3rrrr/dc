'use strict';
const { SlashCommandBuilder } = require('discord.js');
const nexvault = require('./nexvault');
const { EPHEMERAL } = require('./util');

const generate = {
  data: new SlashCommandBuilder().setName('generate').setDescription('Generate a NexVault redemption code (sent by DM)')
    .addStringOption(option => option.setName('category').setDescription('Choose a code category').setRequired(true).setAutocomplete(true)),
  async autocomplete(interaction) {
    let categories = [];
    try { categories = await nexvault.fetchCategories(); } catch { categories = []; }
    const focused = String(interaction.options.getFocused() || '').toLowerCase();
    const choices = categories.filter(c => String(c.name || '').toLowerCase().includes(focused)).slice(0, 25)
      .map(c => ({ name: String(c.name || `Category ${c.id}`).slice(0, 100), value: String(c.id) }));
    await interaction.respond(choices).catch(() => {});
  },
  async execute(interaction) {
    await interaction.deferReply({ flags: EPHEMERAL });
    if (!interaction.inGuild() || !interaction.guildId) return void await interaction.editReply('Use `/generate` inside the configured Discord server.');
    let categories;
    try { categories = await nexvault.fetchCategories(true); }
    catch (error) { return void await interaction.editReply(`NexVault is temporarily unavailable: ${String(error.message || error).slice(0, 350)}`); }
    const categoryId = interaction.options.getString('category', true);
    const category = categories.find(c => String(c.id) === categoryId);
    if (!category) return void await interaction.editReply('That category is unavailable. Please choose an active category from autocomplete.');
    if (category.required_guild_id && interaction.guildId !== String(category.required_guild_id)) {
      return void await interaction.editReply('This category can only be used in its required Discord server.');
    }
    if (category.required_role_id) {
      const roles = interaction.member?.roles?.cache ? [...interaction.member.roles.cache.keys()] : Array.isArray(interaction.member?.roles) ? interaction.member.roles : [];
      if (!roles.includes(String(category.required_role_id))) return void await interaction.editReply('You do not have the required Discord role for this category.');
    }
    let result;
    try { result = await nexvault.generate(interaction.user.id, category.id); }
    catch (error) { return void await interaction.editReply(`Could not generate a code: ${String(error.message || error).slice(0, 350)}`); }
    try {
      await interaction.user.send({ content: `**NexVault redemption code**\nCategory: **${String(result.category || category.name).slice(0, 100)}**\n\n\`${String(result.code).slice(0, 120)}\`\n\nRedeem it at ${nexvault.websiteUrl()}\nEach code can be redeemed once. Keep it private.`, allowedMentions: { parse: [] } });
      await interaction.editReply('Your redemption code has been sent to your direct messages.');
    } catch {
      await interaction.editReply('I could not DM you. Enable direct messages from server members, then run `/generate` again. Your assignment is retained, so retrying will return the same code.');
    }
  },
};
module.exports = { generate };
