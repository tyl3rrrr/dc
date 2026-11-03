'use strict';
const { ActivityType, PresenceUpdateStatus } = require('discord.js');
const DEFAULT_WEBSITE = 'https://nexvault.is-great.org/';
const DEFAULT_API = 'https://pwwvcxgixendhavaszco.supabase.co/functions/v1/nexvault-api';
const ROTATION_MS = 120000;
let categoriesCache = [];
let lastAvailableCount = null;
let presenceToggle = false;
let presenceTimer = null;
let runningClient = null;

function apiUrl() {
  const raw = String(process.env.NEXVAULT_API_URL || DEFAULT_API).trim();
  const url = new URL(raw);
  if (url.protocol !== 'https:' || !url.pathname.endsWith('/functions/v1/nexvault-api')) {
    throw new Error('NEXVAULT_API_URL must be the HTTPS URL of the Supabase nexvault-api Edge Function.');
  }
  return url;
}
function apiKey() {
  const key = String(process.env.NEXVAULT_API_KEY || '').trim();
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error('NEXVAULT_API_KEY is missing or invalid in .env.');
  return key;
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
    headers: { 'X-NV-API-Key': apiKey(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); }
  catch {
    const preview = raw.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
    throw new Error(`Supabase API returned non-JSON (HTTP ${response.status}). ${preview || 'Empty response'}`);
  }
  if (!response.ok) throw new Error(String(data.error || `NexVault API error (${response.status}).`).slice(0, 300));
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
async function releaseAssignment(discordId, categoryId) {
  return api('release_assignment', { discord_id: String(discordId), category_id: Number(categoryId) });
}
async function websiteStatus() {
  const started = Date.now();
  try {
    const result = await api('status');
    return { ok: result.database === 'ok' && Number.isFinite(Number(result.available)), latency: Date.now() - started,
      service: result.service || 'NexVault API', categories: Array.isArray(result.categories) ? result.categories.length : 0,
      available: Number.isFinite(Number(result.available)) ? Number(result.available) : 'unknown' };
  } catch (error) {
    return { ok: false, latency: Date.now() - started, error: String(error.message || error).slice(0, 500) };
  }
}
async function updatePresence() {
  if (!runningClient?.user) return;
  if (!presenceToggle) {
    try { const result = await api('available_count'); const count = Number(result.available); if (!Number.isFinite(count)) throw new Error('API response did not contain a numeric available count.'); lastAvailableCount = count; }
    catch (error) { console.warn(`[NexVault presence] ${String(error.message || error).slice(0, 240)}`); }
    const label = lastAvailableCount === null ? 'codes status unavailable' : `${lastAvailableCount} available codes`;
    runningClient.user.setPresence({ status: PresenceUpdateStatus.DoNotDisturb, activities: [{ name: label, type: ActivityType.Watching }] });
  } else {
    runningClient.user.setPresence({ status: PresenceUpdateStatus.DoNotDisturb, activities: [{ name: 'made by .sl4m3d', type: ActivityType.Watching }] });
  }
  presenceToggle = !presenceToggle;
}
function start(client) {
  if (String(process.env.NEXVAULT_PRESENCE_ROTATION || '').toLowerCase() !== 'true') return;
  stop(); runningClient = client; updatePresence().catch(() => {});
  presenceTimer = setInterval(() => updatePresence().catch(() => {}), ROTATION_MS);
}
function stop() { if (presenceTimer) clearInterval(presenceTimer); presenceTimer = null; runningClient = null; }
module.exports = { DEFAULT_WEBSITE, DEFAULT_API, apiUrl, websiteUrl, api, fetchCategories, generate, releaseAssignment, websiteStatus, start, stop };
