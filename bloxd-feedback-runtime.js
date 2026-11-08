'use strict';

// BloxdAtlas feedback bridge. The publishable Supabase key is public by design;
// never replace it with a service_role key or put a Discord bot token here.
const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const SUPABASE_URL = 'https://aaymcbxsgioljwgahkwh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_YazOl85jRedBn35XkiW9UQ_kT6FDKhD';
const CONFIG_PATH = path.join(__dirname, 'bloxd-feedback-config.json');
const POLL_INTERVAL_MS = 20000;
const MAX_SENT_IDS = 1000;

let runningClient = null;
let pollTimer = null;
let pollInProgress = false;
let settings = loadSettings();

function loadSettings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return {
      channelId: typeof parsed.channelId === 'string' ? parsed.channelId : null,
      lastCheckedAt: typeof parsed.lastCheckedAt === 'string' ? parsed.lastCheckedAt : null,
      sentIds: Array.isArray(parsed.sentIds) ? parsed.sentIds.filter(v => typeof v === 'string').slice(-MAX_SENT_IDS) : []
    };
  } catch (_) {
    return { channelId: null, lastCheckedAt: null, sentIds: [] };
  }
}

function saveSettings() {
  const temp = `${CONFIG_PATH}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(settings, null, 2), { mode: 0o600 });
  fs.renameSync(temp, CONFIG_PATH);
}

function setChannelId(channelId) {
  if (typeof channelId !== 'string' || !/^\d{17,20}$/.test(channelId)) {
    throw new TypeError('A valid Discord text channel ID is required.');
  }
  settings.channelId = channelId;
  // Only forward submissions made after channel configuration, not old history.
  settings.lastCheckedAt = new Date().toISOString();
  settings.sentIds = [];
  saveSettings();
  return settings.channelId;
}

function getChannelId() {
  return settings.channelId;
}

async function getConfiguredChannel(client) {
  if (!settings.channelId) return null;
  const channel = await client.channels.fetch(settings.channelId).catch(() => null);
  if (!channel || !channel.isTextBased?.() || !channel.send) return null;
  return channel;
}

async function fetchFeedback() {
  const since = settings.lastCheckedAt || new Date().toISOString();
  const allRows = [];
  const pageSize = 100;
  // Page until the final short page. created_at is not unique, so include id
  // as a stable tiebreaker and keep the gte filter plus sent-ID dedupe.
  for (let offset = 0; offset < 100000; offset += pageSize) {
    const params = new URLSearchParams({
      select: 'id,message,sender_type,created_at',
      created_at: `gte.${since}`,
      order: 'created_at.asc,id.asc',
      limit: String(pageSize),
      offset: String(offset)
    });
    const response = await fetch(`${SUPABASE_URL}/rest/v1/bloxd_feedback?${params}`, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`Supabase feedback request failed (${response.status}): ${detail}`);
    }
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error('Supabase returned an invalid feedback response.');
    allRows.push(...page);
    if (page.length < pageSize) break;
  }
  return allRows;
}

async function forwardRow(channel, row) {
  const message = String(row.message || '').trim();
  if (!message) return;
  const from = row.sender_type === 'discord' ? 'Discord account' : 'Guest';
  const timestamp = Math.floor(new Date(row.created_at).getTime() / 1000);
  const embed = new EmbedBuilder()
    .setColor(0xffb454)
    .setTitle('BloxdAtlas · New feedback')
    .setDescription(message.slice(0, 4000))
    .addFields(
      { name: 'Sender', value: from, inline: true },
      { name: 'Received', value: Number.isFinite(timestamp) ? `<t:${timestamp}:F>` : 'Unknown', inline: true }
    )
    .setFooter({ text: `Public feedback · ${String(row.id || '').slice(0, 8)}` })
    .setURL('https://sl4m3d.xo.je/feedback.html');
  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
}

async function poll(client) {
  if (pollInProgress || !settings.channelId) return;
  pollInProgress = true;
  try {
    const channel = await getConfiguredChannel(client);
    if (!channel) {
      console.warn('[BloxdAtlas feedback] Configured channel is unavailable or not text-based.');
      return;
    }
    const rows = await fetchFeedback();
    const sent = new Set(settings.sentIds);
    for (const row of rows) {
      if (!row?.id || sent.has(row.id)) continue;
      await forwardRow(channel, row);
      sent.add(row.id);
      settings.sentIds.push(row.id);
      if (row.created_at && (!settings.lastCheckedAt || row.created_at > settings.lastCheckedAt)) {
        settings.lastCheckedAt = row.created_at;
      }
      settings.sentIds = settings.sentIds.slice(-MAX_SENT_IDS);
      saveSettings();
    }
    // Keep a small overlap window so a row committed just after the fetch
    // begins cannot fall between polling windows. IDs suppress duplicates.
    settings.lastCheckedAt = new Date(Date.now() - 5000).toISOString();
    saveSettings();
  } catch (error) {
    console.warn('[BloxdAtlas feedback] Poll failed:', error?.message || error);
  } finally {
    pollInProgress = false;
  }
}

function start(client) {
  if (!client) throw new TypeError('A Discord client is required.');
  runningClient = client;
  if (pollTimer) clearInterval(pollTimer);
  if (settings.channelId) poll(runningClient).catch(() => {});
  pollTimer = setInterval(() => {
    if (runningClient) poll(runningClient).catch(() => {});
  }, POLL_INTERVAL_MS);
  pollTimer.unref?.();
}

function stop() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  runningClient = null;
}

module.exports = { start, stop, setChannelId, getChannelId };
