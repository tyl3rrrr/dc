'use strict';
const { ActivityType, PresenceUpdateStatus } = require('discord.js');
const DEFAULT_WEBSITE = 'https://nexvault.is-great.org/';
const ROTATION_MS = 120000;
let categoriesCache = [];
let lastAvailableCount = null;
let presenceToggle = false;
let presenceTimer = null;
let runningClient = null;

function apiUrl() {
  const raw = String(process.env.NEXVAULT_API || '').trim();
  if (!raw) throw new Error('NEXVAULT_API is not configured in .env.');
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('NEXVAULT_API must use HTTP or HTTPS.');
  if (!url.pathname.toLowerCase().endsWith('.php')) throw new Error('NEXVAULT_API must be the complete API URL from the NexVault Admin Panel.');
  return url;
}
function websiteUrl() {
  const configured = String(process.env.NEXVAULT_WEBSITE_URL || DEFAULT_WEBSITE).trim();
  try { const parsed = new URL(configured); return ['https:', 'http:'].includes(parsed.protocol) ? parsed.origin + parsed.pathname.replace(/\/?$/, '/') : DEFAULT_WEBSITE; }
  catch { return DEFAULT_WEBSITE; }
}
async function api(action, body) {
  const url = apiUrl();
  url.searchParams.set('action', action);
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  const contentType = response.headers.get('content-type') || 'unknown content type';
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); }
  catch {
    const preview = raw.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
    throw new Error(`Website API returned non-JSON (HTTP ${response.status}; ${contentType}). ${preview || 'Empty response'}`);
  }
  if (!response.ok) throw new Error(String(data.error || `Website API error (${response.status}).`).slice(0, 300));
  return data;
}
async function fetchCategories(force = false) {
  if (!force && categoriesCache.length && Date.now() - (fetchCategories.updatedAt || 0) < 60000) return categoriesCache;
  const result = await api('categories');
  categoriesCache = Array.isArray(result.categories) ? result.categories : [];
  fetchCategories.updatedAt = Date.now();
  return categoriesCache;
}
async function generate(discordId, categoryId) {
  return api('generate', { discord_id: String(discordId), category_id: Number(categoryId) });
}
async function websiteStatus() {
  const started = Date.now();
  try {
    const [health, categoryData, countData] = await Promise.all([api('health'), api('categories'), api('available_count')]);
    const categories = Array.isArray(categoryData.categories) ? categoryData.categories.length : 0;
    const available = Number(countData.available);
    return { ok: Number.isFinite(available), latency: Date.now() - started, service: health.service || 'NexVault API', categories, available: Number.isFinite(available) ? available : 'unknown' };
  } catch (error) {
    return { ok: false, latency: Date.now() - started, error: String(error.message || error).slice(0, 500) };
  }
}
async function updatePresence() {
  if (!runningClient?.user) return;
  if (!presenceToggle) {
    try {
      const result = await api('available_count');
      const count = Number(result.available);
      if (!Number.isFinite(count)) throw new Error('API response did not contain a numeric available count.');
      lastAvailableCount = count;
    } catch (error) { console.warn(`[NexVault presence] ${String(error.message || error).slice(0, 240)}`); }
    const label = lastAvailableCount === null ? 'codes status unavailable' : `${lastAvailableCount} available codes`;
    runningClient.user.setPresence({ status: PresenceUpdateStatus.DoNotDisturb, activities: [{ name: label, type: ActivityType.Watching }] });
  } else {
    runningClient.user.setPresence({ status: PresenceUpdateStatus.DoNotDisturb, activities: [{ name: 'made by .sl4m3d', type: ActivityType.Watching }] });
  }
  presenceToggle = !presenceToggle;
}
function start(client) {
  if (String(process.env.NEXVAULT_PRESENCE_ROTATION || '').toLowerCase() !== 'true') return;
  stop();
  runningClient = client;
  updatePresence().catch(() => {});
  presenceTimer = setInterval(() => updatePresence().catch(() => {}), ROTATION_MS);
}
function stop() {
  if (presenceTimer) clearInterval(presenceTimer);
  presenceTimer = null;
  runningClient = null;
}
module.exports = { DEFAULT_WEBSITE, apiUrl, websiteUrl, api, fetchCategories, generate, websiteStatus, start, stop };
