// NexVault bot integration. This Edge Function URL is intentionally hard-coded.
// .env contains only the dedicated 64-character bot API key as NEXVAULT_API.
'use strict';
const { ActivityType, PresenceUpdateStatus } = require('discord.js');

const DEFAULT_WEBSITE = 'https://nexvault.is-great.org/';
const NEXVAULT_API_URL = 'https://aaymcbxsgioljwgahkwh.supabase.co/functions/v1/nexvault-api';
const ROTATION_MS = 120000;
const REQUEST_TIMEOUT_MS = 12000;
let categoriesCache = [];
let categoriesPromise = null;
let lastAvailableCount = null;
let presenceToggle = false;
let presenceTimer = null;
let runningClient = null;

function getApiKey() {
  const key = String(process.env.NEXVAULT_API || '').trim();
  if (!/^[a-f0-9]{64}$/i.test(key)) {
    throw new Error('NEXVAULT_API must contain the 64-character bot key generated in NexVault Admin Panel.');
  }
  return key;
}
function isConfigured() {
  return /^[a-f0-9]{64}$/i.test(String(process.env.NEXVAULT_API || '').trim());
}
function apiUrl(action) {
  if (!/^[a-z][a-z0-9_]{1,48}$/i.test(String(action || ''))) throw new Error('Invalid NexVault action.');
  const url = new URL(NEXVAULT_API_URL);
  url.searchParams.set('action', action);
  return url;
}
function websiteUrl() {
  return DEFAULT_WEBSITE;
}
async function api(action, body) {
  const url = apiUrl(action);
  const key = getApiKey();
  const hasBody = body !== undefined && body !== null;
  const headers = {
    Accept: 'application/json',
    'X-NV-API-Key': key,
    'X-NV-Scope': 'bot',
  };
  const options = {
    method: hasBody ? 'POST' : 'GET',
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };
  if (hasBody) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new Error(`NexVault API request timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`);
    }
    throw new Error(`Could not reach the NexVault Edge Function: ${String(error?.message || error).slice(0, 180)}`);
  }

  const contentType = response.headers.get('content-type') || 'unknown content type';
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); }
  catch {
    throw new Error(`NexVault Edge Function returned non-JSON (HTTP ${response.status}; ${contentType}). Check deployment and endpoint configuration.`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`NexVault Edge Function returned an invalid JSON response (HTTP ${response.status}).`);
  }
  if (!response.ok || data.ok === false) {
    const message = String(data.error || `NexVault API request failed (HTTP ${response.status}).`).slice(0, 280);
    const error = new Error(message);
    error.status = response.status;
    if (Number.isFinite(Number(data.retry_after))) error.retryAfter = Number(data.retry_after);
    throw error;
  }
  return data;
}
async function fetchCategories(force = false) {
  const fresh = categoriesCache.length > 0 && Date.now() - (fetchCategories.updatedAt || 0) < 60000;
  if (!force && fresh) return categoriesCache;
  if (categoriesPromise) return categoriesPromise;
  categoriesPromise = api('categories').then(result => {
    categoriesCache = Array.isArray(result.categories) ? result.categories : [];
    fetchCategories.updatedAt = Date.now();
    return categoriesCache;
  }).finally(() => { categoriesPromise = null; });
  return categoriesPromise;
}
async function generate(discordId, categoryId) {
  return api('generate', { discord_id: String(discordId), category_id: Number(categoryId) });
}
async function websiteStatus() {
  const started = Date.now();
  try {
    const [health, categoryData, countData] = await Promise.all([
      api('health'), api('categories'), api('available_count'),
    ]);
    const categories = Array.isArray(categoryData.categories) ? categoryData.categories.length : 0;
    const available = Number(countData.available);
    if (!Number.isFinite(available)) throw new Error('NexVault returned an invalid available-code count.');
    return { ok: true, latency: Date.now() - started, service: health.service || 'NexVault API', categories, available };
  } catch (error) {
    return { ok: false, latency: Date.now() - started, error: String(error?.message || error).slice(0, 420) };
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
    } catch (error) {
      console.warn(`[NexVault presence] ${String(error?.message || error).slice(0, 220)}`);
    }
    const label = lastAvailableCount === null ? 'codes status unavailable' : `${lastAvailableCount} available codes`;
    await runningClient.user.setPresence({ status: PresenceUpdateStatus.DoNotDisturb, activities: [{ name: label, type: ActivityType.Watching }] });
  } else {
    await runningClient.user.setPresence({ status: PresenceUpdateStatus.DoNotDisturb, activities: [{ name: 'made by .sl4m3d', type: ActivityType.Watching }] });
  }
  presenceToggle = !presenceToggle;
}
function start(client) {
  if (String(process.env.NEXVAULT_PRESENCE_ROTATION || '').toLowerCase() !== 'true') return;
  if (!isConfigured()) {
    console.warn('[NexVault presence] Rotation requested, but NEXVAULT_API is not a valid 64-character bot key.');
    return;
  }
  stop();
  runningClient = client;
  updatePresence().catch(error => console.warn('[NexVault presence]', error.message));
  presenceTimer = setInterval(() => updatePresence().catch(error => console.warn('[NexVault presence]', error.message)), ROTATION_MS);
  presenceTimer.unref?.();
}
function stop() {
  if (presenceTimer) clearInterval(presenceTimer);
  presenceTimer = null;
  runningClient = null;
}
module.exports = { DEFAULT_WEBSITE, NEXVAULT_API_URL, apiUrl, isConfigured, websiteUrl, api, fetchCategories, generate, websiteStatus, start, stop };
