const platforms = [
  { id: 'discord', name: 'Discord', icon: 'fa-brands fa-discord', color: '#5865f2', bg: '#eef0ff', domains: [...presetDomains.discord], note: 'Chat, voice, and community services' },
  { id: 'duckduckgo', name: 'DuckDuckGo', icon: 'fa-solid fa-magnifying-glass', color: '#e45b33', bg: '#fff0e9', domains: [...presetDomains.duckduckgo], note: 'Private search and related assets' },
  { id: 'facebook', name: 'Facebook', icon: 'fa-brands fa-facebook-f', color: '#0866ff', bg: '#e9f1ff', domains: [...presetDomains.facebook], note: 'Social and messaging services' },
  { id: 'instagram', name: 'Instagram', icon: 'fa-brands fa-instagram', color: '#d34b80', bg: '#fff0f6', domains: [...presetDomains.instagram], note: 'Photos, reels, and media assets' },
  { id: 'github', name: 'GitHub', icon: 'fa-brands fa-github', color: '#24292f', bg: '#e9edf1', domains: [...presetDomains.github], note: 'Code hosting and related assets' },
  { id: 'huggingface', name: 'Hugging Face', emoji: '🤗', domains: [...presetDomains.huggingface], note: 'Models, datasets, and inference' },
  { id: 'ao3', name: 'AO3', icon: 'fa-solid fa-book-open', color: '#990000', bg: '#fff0f0', domains: [...presetDomains.ao3], note: 'Archive of Our Own' },
  { id: 'pixiv', name: 'Pixiv', icon: 'fa-solid fa-paintbrush', color: '#0096fa', bg: '#e7f6ff', domains: [...presetDomains.pixiv], note: 'Artwork and image delivery' },
  { id: 'steam', name: 'Steam', icon: 'fa-brands fa-steam', color: '#1b2838', bg: '#e8f0f7', domains: [...presetDomains.steam], note: 'Store, community, downloads, and game assets' },
  { id: 'twitch', name: 'Twitch', icon: 'fa-brands fa-twitch', color: '#9146ff', bg: '#f4ecff', domains: [...presetDomains.twitch], note: 'Streaming and media assets' },
  { id: 'x', name: 'X', icon: 'fa-brands fa-x-twitter', color: '#252525', bg: '#ededed', domains: [...presetDomains.x], note: 'Posts, images, and linked media' }
];
const themeToggle = document.querySelector('#theme-toggle');
const themeIcon = document.querySelector('#theme-icon');
document.documentElement.classList.toggle('macos', navigator.platform.startsWith('Mac'));
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
let themePreference = localStorage.getItem('swarm-tools-theme') || localStorage.getItem('northstar-theme') || 'system';
if (!['system', 'light', 'dark'].includes(themePreference)) themePreference = 'system';
function applyTheme() {
  const resolved = themePreference === 'system' ? (systemTheme.matches ? 'dark' : 'light') : themePreference;
  document.documentElement.dataset.theme = resolved;
  const iconFile = resolved === 'dark' ? 'app-icon-dark.png' : 'app-icon.png';
  document.querySelector('#brand-icon').src = `assets/${iconFile}?v=6`;
  document.querySelector('#app-favicon').href = `assets/${iconFile}?v=6`;
  window.desktop.setAppearance(themePreference);
  themeIcon.className = `fa-solid fa-${resolved === 'dark' ? 'sun' : 'moon'}`;
  const label = `Switch to ${resolved === 'dark' ? 'light' : 'dark'} theme`;
  themeToggle.setAttribute('aria-label', label);
  themeToggle.title = label;
}
themeToggle.addEventListener('click', () => { themePreference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('swarm-tools-theme', themePreference); applyTheme(); });
systemTheme.addEventListener('change', () => { if (themePreference === 'system') applyTheme(); });
applyTheme();
const content = document.querySelector('#main-content');
const nav = document.querySelector('#platform-nav');
const saveStatus = document.querySelector('#save-status');
let config = null;
let current = 'overview';
let dirty = false;
let editRevision = 0;
let autoSaveReady = false;
let autoSaveTimer = null;
let autoSaveInFlight = null;
let savingRevision = 0;
let coreStatus = { running: false, logs: [], error: '' };
let configFile = '';
let speedtestTargets = '';
let speedtestResult = '';
let caExists = false;
let systemSettings = { enabled: false, hosts: false, proxy: false, dns: true };
let systemConfigOpen = false;
let systemSettingsUpdating = false;
let savedRoutingMode = 'rule';
let pendingRoutingMode = null;
const lastRoutingModeKey = 'swarm-last-active-routing-mode';
const communityEnabledKey = 'swarm-community-upload-enabled';
let communityUploadEnabled = localStorage.getItem(communityEnabledKey) === 'true';
let currentIpInfo = { status: 'idle', data: null };

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const val = (path, fallback = '') => path.split('.').reduce((obj, key) => obj?.[key], config) ?? fallback;
const routingActive = mode => mode === 'rule' || mode === 'global';
const activeRoutingMode = () => {
  const mode = localStorage.getItem(lastRoutingModeKey);
  return routingActive(mode) ? mode : 'rule';
};
const comma = values => Array.isArray(values) ? values.join(', ') : '';
const listNames = {
  'aka-iplist': 'Akamai IP list',
  'cf-iplist': 'Cloudflare IP list',
  'cft-iplist': 'CloudFront IP list',
  'fl-iplist': 'Fastly IP list'
};
function listLabel(name) {
  return listNames[name] || name.replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()).replace(/\bIplist\b/g, 'IP list');
}
function set(path, value) {
  const keys = path.split('.'); let target = config;
  for (const key of keys.slice(0, -1)) target = target[key] ||= {};
  target[keys.at(-1)] = value;
  markDirty();
}
function markDirty() {
  dirty = true;
  editRevision++;
  saveStatus.textContent = 'Saving…';
  if (autoSaveReady) scheduleAutoSave();
}
function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => flushAutoSave().catch(error => { saveStatus.textContent = 'Not saved'; toast(error.message, true); }), 350);
}
async function flushAutoSave() {
  clearTimeout(autoSaveTimer);
  if (autoSaveInFlight) {
    await autoSaveInFlight;
    if (dirty && editRevision > savingRevision) return flushAutoSave();
    return;
  }
  if (!autoSaveReady || !dirty) return;
  validate();
  const nextConfig = structuredClone(config);
  const mode = nextConfig.routing?.mode || 'rule';
  savingRevision = editRevision;
  autoSaveInFlight = applyRoutingConfig(nextConfig, { ...systemSettings, enabled: routingActive(mode) }, routingActive(mode));
  try { await autoSaveInFlight; }
  finally {
    autoSaveInFlight = null;
    if (dirty && editRevision > savingRevision) scheduleAutoSave();
  }
}
function includeAddedDomainRules(domains) {
  const rules = val('routing.rules', []);
  const additions = [...new Set(domains.map(domain => `||${domain}`))].filter(rule => !rules.includes(rule));
  if (additions.length) set('routing.rules', [...rules, ...additions]);
}
function toast(message, error = false) {
  const el = document.querySelector('#toast');
  el.textContent = message; el.className = `toast visible${error ? ' error' : ''}`;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('visible'), 4200);
}
function icon(platform, large = false) {
  if (platform.emoji) return `<span class="platform-icon emoji${large ? ' large' : ''}" aria-hidden="true">${esc(platform.emoji)}</span>`;
  return `<span class="platform-icon${large ? ' large' : ''}" style="--icon-color:${platform.color};--icon-bg:${platform.bg}"><i class="${platform.icon}" aria-hidden="true"></i></span>`;
}
function field(label, path, type = 'text') { return `<label class="field"><span>${label}</span><input data-path="${path}" type="${type}" value="${esc(val(path))}" ${type === 'number' ? 'min="0"' : ''} /></label>`; }
function cardTitle(kicker, title, text) { return `<div class="section-head"><div><span class="eyebrow">${kicker}</span><h2>${title}</h2><p>${text}</p></div></div>`; }
function currentIpMarkup() {
  if (currentIpInfo.status === 'loading' || currentIpInfo.status === 'idle') return '<strong>Your current IP</strong><p>Looking up your IP and location…</p>';
  if (currentIpInfo.status === 'error') return '<strong>Your current IP</strong><p>Unable to load your IP location. Check your connection and try again.</p><button class="text-button" data-action="refresh-ip" type="button">Retry</button>';
  const { ip, city, region, country } = currentIpInfo.data;
  const countryName = /^[A-Z]{2}$/.test(country || '') ? new Intl.DisplayNames(['en'], { type: 'region' }).of(country) : country;
  const location = [city, region, countryName].filter(Boolean).join(', ') || 'Location unavailable';
  return `<div class="current-ip-head"><strong>Your current IP</strong><button class="text-button" data-action="refresh-ip" type="button">Refresh</button></div><div class="current-ip-value">${esc(ip)}</div><p>${esc(location)}</p><small>Location provided by IPinfo for your public IP.</small>`;
}
async function loadCurrentIpInfo() {
  if (currentIpInfo.status === 'loading') return;
  currentIpInfo = { status: 'loading', data: null };
  const card = content.querySelector('#current-ip-card');
  if (card) card.innerHTML = currentIpMarkup();
  try {
    const response = await fetch('https://ipinfo.io/json', { signal: AbortSignal.timeout(10000), cache: 'no-store' });
    if (!response.ok) throw new Error('IPinfo request failed');
    const data = await response.json();
    if (typeof data.ip !== 'string' || !data.ip) throw new Error('IPinfo returned no IP');
    currentIpInfo = { status: 'ready', data };
  } catch {
    currentIpInfo = { status: 'error', data: null };
  }
  const visibleCard = content.querySelector('#current-ip-card');
  if (visibleCard) visibleCard.innerHTML = currentIpMarkup();
}
function communityMarkup() {
  return `<section class="surface form-surface">${cardTitle('COMMUNITY', 'Your IP location', 'See the public IP and approximate location of your current connection.')}
    <label class="community-toggle"><span><strong>Allow community uploads</strong><small>Uploads are unavailable until a community API is configured. This preference is off by default.</small></span><input id="community-upload-enabled" type="checkbox" ${communityUploadEnabled ? 'checked' : ''} /></label>
    <div class="info-tile current-ip-card" id="current-ip-card" aria-live="polite">${currentIpMarkup()}</div>
  </section>`;
}
function renderNav() {
  nav.innerHTML = platforms.map(platform => `<button class="nav-item platform-nav${current === platform.id ? ' selected' : ''}" data-page="${esc(platform.id)}" type="button">${icon(platform)}<span>${esc(platform.name)}</span><span class="nav-arrow"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></span></button>`).join('');
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('selected', button.dataset.page === current));
}
function renderOverview() {
  const custom = Object.keys(val('origin.domains', {})).length;
  const routingMode = pendingRoutingMode || val('routing.mode', 'rule');
  const selectedMethod = ['hosts', 'proxy', 'dns'].find(key => systemSettings[key]) || 'dns';
  const methodName = { hosts: 'Hosts file', proxy: 'System proxy', dns: 'System DNS' }[selectedMethod];
  content.innerHTML = `<div class="section-row overview-heading"><div><span class="eyebrow">AT A GLANCE</span><h1>Network overview</h1></div></div>
  <section class="surface routing-surface" aria-label="Routing controls"><div class="routing-row"><span class="routing-icon"><i class="fa-solid fa-globe" aria-hidden="true"></i></span><span class="routing-label"><strong>Routing</strong></span><label class="switch" aria-label="Routing"><input type="checkbox" data-system-setting="enabled" ${routingActive(routingMode) ? 'checked' : ''} ${window.desktop.platform === 'darwin' ? '' : 'disabled'} /><span class="switch-track" aria-hidden="true"></span></label></div><button class="routing-row routing-config-row" data-action="toggle-system-config" aria-expanded="${systemConfigOpen}" aria-controls="system-config-panel" type="button"><span class="routing-icon"><i class="fa-solid fa-sliders" aria-hidden="true"></i></span><span class="routing-label"><strong>Connection methods</strong></span><span class="routing-current-method">${esc(methodName)}</span><span class="routing-config-link"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></span></button><div class="routing-config-panel" id="system-config-panel" ${systemConfigOpen ? '' : 'hidden'}><div class="routing-methods" role="radiogroup" aria-label="Connection method"><label class="routing-method"><span><strong>Hosts file</strong><small>Route listed sites through the local gateway. The gateway CA must be trusted by your Mac.</small></span><input type="radio" name="connection-method" data-system-setting="hosts" ${selectedMethod === 'hosts' ? 'checked' : ''} ${window.desktop.platform === 'darwin' ? '' : 'disabled'} /></label><label class="routing-method"><span><strong>System proxy</strong><small>Use the local HTTP proxy while routing is on</small></span><input type="radio" name="connection-method" data-system-setting="proxy" ${selectedMethod === 'proxy' ? 'checked' : ''} ${window.desktop.platform === 'darwin' ? '' : 'disabled'} /></label><label class="routing-method"><span><strong>System DNS</strong><small>Use the local DNS server while routing is on</small></span><input type="radio" name="connection-method" data-system-setting="dns" ${selectedMethod === 'dns' ? 'checked' : ''} ${window.desktop.platform === 'darwin' ? '' : 'disabled'} /></label></div></div></section>
  <div class="stat-grid"><div class="stat-card"><div class="stat-icon blue"><i class="fa-solid fa-layer-group"></i></div><span>SITES</span><strong>${platforms.length}</strong><small>Ready to configure</small></div><div class="stat-card"><div class="stat-icon purple"><i class="fa-solid fa-globe"></i></div><span>ORIGIN RULES</span><strong>${custom}</strong><small>Exact & wildcard domains</small></div><div class="stat-card"><div class="stat-icon green"><i class="fa-solid fa-route"></i></div><span>ROUTING MODE</span><strong class="stat-word">${esc(routingMode)}</strong><small>${routingMode === 'rule' ? 'GFW List rules' : routingMode === 'global' ? 'All domains' : 'Direct connections'}</small></div></div>
  ${coreStatus.error ? `<div class="alert">${esc(coreStatus.error)} Check the activity log in Settings.</div>` : ''}`;
  if (systemSettingsUpdating || coreStatus.starting) content.querySelectorAll('[data-system-setting]').forEach(input => { input.disabled = true; });
}
function renderGlobal() {
  content.innerHTML = `<div class="page-intro settings-intro"><div class="page-emblem"><i class="fa-solid fa-gear" aria-hidden="true"></i></div><div><span class="eyebrow">PREFERENCES</span><h1>Settings</h1><p>Configure direct origin access, DNS, and local listeners.</p></div></div>
  <section class="surface form-surface">${cardTitle('DNS RESOLUTION', 'DNS over HTTPS', 'Resolve selected sites through the configured encrypted DNS endpoint.')}<div class="form-grid">${field('Primary DoH endpoint', 'dns.doh_server')}<label class="field"><span>Bootstrap IP addresses</span><input data-array="dns.bootstrap_addresses" value="${esc(comma(val('dns.bootstrap_addresses', [])))}" /></label>${field('Direct DoH endpoint', 'dns.direct_doh_server')}<label class="field"><span>Direct bootstrap IPs</span><input data-array="dns.direct_bootstrap_addresses" value="${esc(comma(val('dns.direct_bootstrap_addresses', [])))}" /></label></div></section>
  <section class="surface form-surface">${cardTitle('MATCHING & REWRITES', 'Routing rules', 'Use the GFW List for generic wildcard coverage and add your own domain rules.')}<div class="form-grid"><label class="field"><span>Routing mode</span><select data-path="routing.mode"><option value="rule" ${val('routing.mode') === 'rule' ? 'selected' : ''}>Rule · GFW List</option><option value="global" ${val('routing.mode') === 'global' ? 'selected' : ''}>Global · all domains</option><option value="bypass" ${val('routing.mode') === 'bypass' ? 'selected' : ''}>Bypass · direct only</option></select></label>${field('Rule list URL', 'routing.rule_list_url')}${field('Refresh interval (hours)', 'routing.refresh_hours', 'number')}</div><label class="field full"><span>Additional routing rules</span><textarea data-lines="routing.rules" rows="4" placeholder="||example.com">${esc((val('routing.rules', []) || []).join('\n'))}</textarea></label></section>
  <section class="surface form-surface">${cardTitle('CDN ORIGINS', 'Origin IP lists', 'Named CDN lists can supply candidate IPs to any site domain. Startup checks use bundled provider CIDR snapshots.')}<div class="list-grid">${Object.entries(val('origin.lists', {})).map(([name, url]) => `<label class="field"><span>${esc(listLabel(name))}</span><input data-list-url="${esc(name)}" value="${esc(url)}" /></label>`).join('')}</div></section>
  <section class="surface form-surface">${cardTitle('LOCAL LISTENERS', 'Proxy & DNS ports', 'Optional local proxy and DNS ports for apps that use them.')}<div class="form-grid">${field('HTTP proxy', 'proxy.http_listen')}${field('SOCKS5 proxy', 'proxy.socks5_listen')}${field('Local DNS', 'dns.listen')}</div><button class="ca-button" data-action="toggle-ca" aria-expanded="false" aria-controls="ca-panel" type="button"><span class="muted-icon"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i></span><span><strong>HTTPS gateway CA</strong><small>Generate or trust the certificate</small></span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button><div class="ca-panel" id="ca-panel" hidden><p>Starting all listeners requires an existing CA certificate and key. Hosts and system DNS routing also require this CA to be trusted by your Mac. The app creates and trusts a missing CA on first start. Regenerating backs up the old files; trust the new CA and remove old trust separately.</p><div class="ca-actions"><button class="text-button" data-action="generate-ca" type="button">${caExists ? 'Regenerate CA files' : 'Generate CA files'}</button><button class="text-button" data-action="trust-ca" type="button">Trust gateway CA</button></div></div></section>
  ${communityMarkup()}
  <section class="surface form-surface speedtest-surface">${cardTitle('CONNECTION QUALITY', 'IP selection & speed test', 'Core checks provider IPs at startup, verifies HTTPS certificates, and selects fast candidates. You can also test addresses on demand.')}<div class="form-grid">${field('Download size (bytes)', 'speedtest.download_bytes', 'number')}${field('Minimum speed (Mbps)', 'speedtest.min_mbps', 'number')}${field('Timeout (seconds)', 'speedtest.timeout_seconds', 'number')}<label class="field"><span>Addresses to test</span><input id="speedtest-targets" value="${esc(speedtestTargets)}" placeholder="1.1.1.1:443, 1.0.0.0/24" /></label></div><button class="primary" data-action="speedtest" type="button">Run speed test</button><pre id="speedtest-output" ${speedtestResult ? '' : 'hidden'}>${esc(speedtestResult)}</pre></section>
  <section class="surface form-surface activity">${cardTitle('DIAGNOSTICS', 'Activity log', `Configuration: ${esc(configFile)}`)}<pre id="log-output">${esc((coreStatus.logs || []).join('\n') || 'No activity yet. Start the service to see its output.')}</pre><div class="diagnostic-actions"><span>Restore the core's source configuration. Platform data and CA files are kept.</span><button class="reset-config-button" data-action="reset-config" type="button">Reset config</button></div></section>`;
}
function renderPlatform(platform) {
  const domains = [...platform.domains].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  const entries = domains.map(domain => {
    const entry = config.origin?.domains?.[domain];
    const wildcard = config.origin?.domains?.[`*.${domain}`];
    const source = entry ?? wildcard ?? [];
    const sourceText = Array.isArray(source) ? source.join(', ') : source;
    return `<div class="domain-row"><div><strong>${esc(domain)}</strong><small>${wildcard ? 'Wildcard configured' : entry ? 'Exact domain configured' : 'Automatic via DoH'}</small></div><input data-domain-ip="${esc(domain)}" aria-label="Origin IPs for ${esc(domain)}" value="${esc(sourceText)}" placeholder="Auto · list name or IPs" /><label class="checkbox"><input data-wildcard="${esc(domain)}" type="checkbox" ${wildcard ? 'checked' : ''} /><span>Subdomains</span></label>${platform.addedDomains?.includes(domain) ? `<button class="remove-domain-button" data-action="remove-domain" data-domain="${esc(domain)}" type="button" aria-label="Remove ${esc(domain)}" title="Remove ${esc(domain)}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>` : ''}</div>`;
  }).join('');
  content.innerHTML = `<div class="platform-header"><div>${icon(platform, true)}<div><span class="eyebrow">SITE SETTINGS</span><h1>${esc(platform.name)}</h1><p>${esc(platform.note)}</p></div></div></div>
  <section class="surface form-surface"><div class="section-head"><div><span class="eyebrow">DOMAIN COVERAGE</span><h2>Domains & origin IPs</h2><p>Enter a named CDN list or comma-separated IPs. Leave blank for automatic DoH resolution.</p></div><button class="new-domain-button" data-action="show-add-domain" type="button">New</button></div><form id="add-domain-form" class="add-domain-form" hidden><input id="new-domain" name="domain" placeholder="example.com" aria-label="New domain" required /><button type="submit">Add domain</button><button data-action="cancel-add-domain" type="button">Cancel</button></form><div class="domain-list">${entries}</div></section>`;
}
function popupClosed() { document.dispatchEvent(new Event('app:popup-close')); }
function render() { renderNav(); if (!config) return; if (current === 'overview') renderOverview(); else if (current === 'global') { renderGlobal(); if (currentIpInfo.status === 'idle') loadCurrentIpInfo(); } else renderPlatform(platforms.find(p => p.id === current)); updateStatus(); }
function updateStatus() {
  if (current === 'global') {
    const log = document.querySelector('#log-output');
    if (log) log.textContent = (coreStatus.logs || []).join('\n') || 'No activity yet. Start the service to see its output.';
  }
}
function platformChange(domain) {
  const input = content.querySelector(`[data-domain-ip="${domain}"]`);
  const wildcard = content.querySelector(`[data-wildcard="${domain}"]`).checked;
  const raw = input.value.trim();
  const ips = raw.split(',').map(s => s.trim()).filter(Boolean);
  const source = raw && config.origin?.lists?.[raw] ? raw : ips;
  config.origin ||= {}; config.origin.domains ||= {};
  delete config.origin.domains[domain]; delete config.origin.domains[`*.${domain}`];
  if (ips.length) { config.origin.domains[domain] = source; if (wildcard) config.origin.domains[`*.${domain}`] = source; }
  markDirty();
}
function validate() {
  for (const key of ['dns.doh_server', 'dns.direct_doh_server', 'routing.rule_list_url']) {
    const value = val(key);
    if (!value && key !== 'dns.doh_server') continue;
    try { const url = new URL(value); if (!['https:', 'http:'].includes(url.protocol)) throw Error(); }
    catch { throw new Error(`${key} must be a valid HTTP(S) URL.`); }
  }
  for (const [name, url] of Object.entries(val('origin.lists', {}))) {
    try { if (new URL(url).protocol !== 'https:') throw Error(); }
    catch { throw new Error(`Origin list ${name} requires an HTTPS URL.`); }
  }
}

async function applyRoutingConfig(nextConfig, nextSettings, startWhenStopped) {
  if (systemSettingsUpdating) throw new Error('Wait for the current network change to finish.');
  const previousConfig = config;
  const previousSettings = systemSettings;
  const previousFile = configFile;
  const previousDirty = dirty;
  const previousMode = savedRoutingMode;
  const startingRevision = editRevision;
  let persistedConfig;
  let savedConfig = false;
  let savedSettings = false;
  let wasRunning = false;
  systemSettingsUpdating = true;
  pendingRoutingMode = nextConfig.routing?.mode || 'rule';
  saveStatus.textContent = 'Saving…';
  if (current === 'overview') renderOverview();
  try {
    const status = await window.desktop.coreStatus();
    if (status.starting) throw new Error('Wait for the network service to finish starting.');
    wasRunning = status.running;
    if (wasRunning) await window.desktop.stopCore();
    persistedConfig = (await window.desktop.loadConfig()).config;
    const nextFile = await window.desktop.saveConfig(nextConfig);
    savedConfig = true;
    const appliedSettings = await window.desktop.saveSystemSettings(nextSettings);
    savedSettings = true;
    if (routingActive(nextConfig.routing?.mode) && (wasRunning || startWhenStopped)) await window.desktop.startCore();
    const newerEdits = editRevision !== startingRevision;
    if (!newerEdits) config = nextConfig;
    configFile = nextFile;
    systemSettings = appliedSettings;
    savedRoutingMode = nextConfig.routing?.mode || 'rule';
    if (routingActive(savedRoutingMode)) localStorage.setItem(lastRoutingModeKey, savedRoutingMode);
    else if (routingActive(previousMode)) localStorage.setItem(lastRoutingModeKey, previousMode);
    dirty = newerEdits;
    saveStatus.textContent = newerEdits ? 'Saving…' : 'Saved';
    if (!newerEdits) render();
  } catch (error) {
    const recoveryErrors = [];
    if (savedConfig) {
      try { if ((await window.desktop.coreStatus()).running) await window.desktop.stopCore(); }
      catch (failedRecovery) { recoveryErrors.push(failedRecovery.message); }
      try { await window.desktop.saveConfig(persistedConfig); }
      catch (failedRecovery) { recoveryErrors.push(failedRecovery.message); }
    }
    if (savedSettings) {
      try { await window.desktop.saveSystemSettings(previousSettings); }
      catch (failedRecovery) { recoveryErrors.push(failedRecovery.message); }
    }
    if (wasRunning) {
      try { if (!(await window.desktop.coreStatus()).running) await window.desktop.startCore(); }
      catch (failedRecovery) { recoveryErrors.push(failedRecovery.message); }
    }
    config = previousConfig;
    configFile = previousFile;
    systemSettings = previousSettings;
    savedRoutingMode = previousMode;
    dirty = previousDirty || editRevision !== startingRevision;
    saveStatus.textContent = dirty ? 'Not saved' : 'Saved';
    render();
    throw new Error(recoveryErrors.length ? `${error.message} Recovery failed: ${recoveryErrors.join('; ')}` : error.message);
  } finally {
    systemSettingsUpdating = false;
    pendingRoutingMode = null;
    if (current === 'overview') renderOverview();
  }
}
document.addEventListener('click', async event => {
  const page = event.target.closest('[data-page]')?.dataset.page;
  if (page) { current = page; render(); return; }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'show-add-platform') { const form = document.querySelector('#platform-create-form'); form.hidden = !form.hidden; if (!form.hidden) form.querySelector('input').focus(); else popupClosed(); }
  if (action === 'cancel-add-platform') { const form = document.querySelector('#platform-create-form'); form.reset(); form.hidden = true; popupClosed(); }
  if (action === 'show-add-domain') { const form = content.querySelector('#add-domain-form'); form.hidden = !form.hidden; if (!form.hidden) form.querySelector('input').focus(); else popupClosed(); }
  if (action === 'cancel-add-domain') { const form = content.querySelector('#add-domain-form'); form.reset(); form.hidden = true; popupClosed(); }
  if (action === 'remove-domain') {
    const button = event.target.closest('button');
    const platform = platforms.find(item => item.id === current);
    const domain = button.dataset.domain;
    if (!platform?.addedDomains?.includes(domain)) return;
    button.disabled = true;
    try {
      await window.desktop.removePlatformDomain(platform.id, domain);
      platform.addedDomains = platform.addedDomains.filter(item => item !== domain);
      platform.domains = platform.domains.filter(item => item !== domain);
      if (!platforms.some(item => item.domains.includes(domain))) {
        delete config.origin?.domains?.[domain];
        delete config.origin?.domains?.[`*.${domain}`];
        config.routing.rules = (config.routing.rules || []).filter(rule => rule !== `||${domain}`);
      }
      markDirty();
      render();
      toast(`${domain} removed. Routing will update automatically.`);
    } catch (error) { button.disabled = false; toast(error.message, true); }
  }
  if (action === 'toggle-system-config') { systemConfigOpen = !systemConfigOpen; if (!systemConfigOpen) popupClosed(); renderOverview(); }
  if (action === 'toggle-ca') { const button = event.target.closest('button'); const panel = document.querySelector('#ca-panel'); panel.hidden = !panel.hidden; button.setAttribute('aria-expanded', String(!panel.hidden)); if (panel.hidden) popupClosed(); }
  if (action === 'generate-ca') {
    const button = event.target.closest('button');
    button.disabled = true;
    try {
      const result = await window.desktop.generateCA();
      caExists = true;
      button.textContent = 'Regenerate CA files';
      toast(result.regenerated ? 'CA regenerated. Previous files backed up; trust the new CA.' : 'CA files generated.');
    } catch (error) { toast(error.message, true); }
    finally { button.disabled = false; }
  }
  if (action === 'trust-ca') { try { const result = await window.desktop.trustCA(); toast(result || 'Gateway CA trusted.'); } catch (error) { toast(error.message, true); } }
  if (action === 'reset-config') {
    const confirmed = window.confirm('Reset configuration to the core defaults? Your current saved config will be backed up, and routing may restart.');
    popupClosed();
    if (!confirmed) return;
    const button = event.target.closest('button');
    button.disabled = true;
    try {
      if (autoSaveInFlight) await autoSaveInFlight.catch(() => {});
      clearTimeout(autoSaveTimer);
      autoSaveReady = false;
      const { config: defaults, backupPath } = await window.desktop.prepareConfigReset();
      const mode = defaults.routing?.mode || 'rule';
      await applyRoutingConfig(defaults, { ...systemSettings, enabled: routingActive(mode) }, routingActive(mode));
      toast(backupPath ? 'Config reset to defaults. Previous config backed up.' : 'Config reset to defaults.');
    } catch (error) { toast(error.message, true); }
    finally {
      autoSaveReady = true;
      if (dirty) scheduleAutoSave();
      button.disabled = false;
    }
  }
  if (action === 'refresh-ip') loadCurrentIpInfo();
  if (action === 'speedtest') {
    const button = event.target.closest('button');
    const targets = (document.querySelector('#speedtest-targets')?.value || '').split(/[\s,]+/).filter(Boolean);
    if (!targets.length) { toast('Enter at least one IP:port address or IPv4 CIDR range.', true); return; }
    button.disabled = true;
    speedtestResult = 'Running speed test…';
    const output = document.querySelector('#speedtest-output');
    output.textContent = speedtestResult;
    output.hidden = false;
    try {
      await flushAutoSave();
      speedtestResult = await window.desktop.speedtest(targets);
    } catch (error) { speedtestResult = error.message; toast(error.message, true); }
    output.textContent = speedtestResult;
    output.hidden = !speedtestResult;
    button.disabled = false;
  }
});
document.addEventListener('submit', async event => {
  if (event.target.id === 'platform-create-form') {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const added = await window.desktop.addPlatform(form.elements.namedItem('platformName').value);
      platforms.push({ ...added, icon: 'fa-solid fa-globe', color: '#4285f4', bg: '#eaf2ff', domains: [], note: 'Your custom platform' });
      platforms.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
      form.reset(); form.hidden = true; popupClosed();
      current = added.id;
      render();
      toast(`${added.name} added.`);
    } catch (error) { toast(error.message, true); }
    finally { button.disabled = false; }
  }
  if (event.target.id === 'add-domain-form') {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('[type="submit"]');
    const platform = platforms.find(item => item.id === current);
    const domain = form.elements.namedItem('domain').value.trim().toLowerCase().replace(/\.$/, '');
    if (platform.domains.includes(domain)) { toast('That domain is already on this platform.', true); return; }
    button.disabled = true;
    try {
      const added = await window.desktop.addPlatformDomain(platform.id, domain);
      platform.domains.push(added.domain);
      platform.addedDomains ||= [];
      platform.addedDomains.push(added.domain);
      includeAddedDomainRules([added.domain]);
      markDirty();
      popupClosed();
      render();
      toast(`${added.domain} added. Routing will update automatically.`);
    } catch (error) { toast(error.message, true); }
    finally { button.disabled = false; }
  }
});
content.addEventListener('change', async event => {
  const systemSetting = event.target.dataset.systemSetting;
  if (systemSetting === 'enabled') {
    if (systemSettingsUpdating) { event.target.checked = routingActive(val('routing.mode', 'rule')); return; }
    const enabled = event.target.checked;
    const nextConfig = structuredClone(config);
    nextConfig.routing ||= {};
    nextConfig.routing.mode = enabled ? (routingActive(val('routing.mode')) ? val('routing.mode') : activeRoutingMode()) : 'bypass';
    const nextSettings = { ...systemSettings, enabled };
    try {
      validate();
      await applyRoutingConfig(nextConfig, nextSettings, enabled);
      toast(enabled ? `${nextConfig.routing.mode === 'global' ? 'Global' : 'Rule'} routing started.` : 'Routing stopped. Bypass mode saved.');
    } catch (error) { if (current === 'overview') renderOverview(); toast(error.message, true); }
    return;
  }
  if (systemSetting) {
    if (systemSettingsUpdating) { renderOverview(); return; }
    if (systemSettings[systemSetting]) return;
    const previous = { ...systemSettings };
    let wasRunning = false;
    let saved = false;
    let restartError = null;
    systemSettingsUpdating = true;
    try {
      const status = await window.desktop.coreStatus();
      if (status.starting) throw new Error('Wait for the network service to finish starting.');
      wasRunning = status.running;
      const next = { enabled: routingActive(val('routing.mode', 'rule')), hosts: systemSetting === 'hosts', proxy: systemSetting === 'proxy', dns: systemSetting === 'dns' };
      systemSettings = await window.desktop.saveSystemSettings(next);
      saved = true;
      if (current === 'overview') renderOverview();
      if (wasRunning) {
        await window.desktop.stopCore();
        await window.desktop.startCore();
        toast('macOS network settings applied.');
      } else if (next.enabled) {
        await window.desktop.startCore();
        toast('macOS network settings applied.');
      } else toast('Settings saved. Turn on Routing to apply them.');
    } catch (error) {
      try {
        systemSettings = saved ? await window.desktop.saveSystemSettings(previous) : previous;
        if (wasRunning && !(await window.desktop.coreStatus()).running) await window.desktop.startCore();
      } catch (rollbackError) { restartError = rollbackError; }
      toast(restartError ? `${error.message} Could not restore the previous service: ${restartError.message}` : error.message, true);
    } finally {
      systemSettingsUpdating = false;
      if (current === 'overview') renderOverview();
    }
    return;
  }
  if (event.target.id === 'community-upload-enabled') {
    communityUploadEnabled = event.target.checked;
    localStorage.setItem(communityEnabledKey, String(communityUploadEnabled));
    return;
  }
  if (event.target.id === 'speedtest-targets') speedtestTargets = event.target.value;
  const { path, array, lines, domainIp, wildcard, listUrl } = event.target.dataset;
  if (path) set(path, event.target.type === 'number' ? Number(event.target.value) : event.target.value);
  if (array) set(array, event.target.value.split(',').map(s => s.trim()).filter(Boolean));
  if (lines) set(lines, event.target.value.split('\n').map(s => s.trim()).filter(Boolean));
  if (listUrl) { config.origin.lists[listUrl] = event.target.value.trim(); markDirty(); }
  if (domainIp || wildcard) platformChange(domainIp || wildcard);
});
window.desktop.onCoreStatus(status => { coreStatus = status; if (status.running) caExists = true; updateStatus(); if (current === 'overview') renderOverview(); });
(async () => {
  try {
    const loaded = await window.desktop.loadConfig();
    const [settings, certificate, savedPlatforms] = await Promise.all([
      window.desktop.loadSystemSettings(), window.desktop.caStatus(), window.desktop.loadPlatforms()
    ]);
    config = loaded.config;
    configFile = loaded.file;
    savedRoutingMode = config.routing?.mode || 'rule';
    systemSettings = settings.enabled === routingActive(savedRoutingMode) ? settings : await window.desktop.saveSystemSettings({ ...settings, enabled: routingActive(savedRoutingMode) });
    if (routingActive(savedRoutingMode)) localStorage.setItem(lastRoutingModeKey, savedRoutingMode);
    caExists = certificate.exists;
    for (const platform of platforms) {
      platform.addedDomains = savedPlatforms.domains[platform.id] || [];
      platform.domains.push(...platform.addedDomains.filter(domain => !platform.domains.includes(domain)));
    }
    for (const saved of savedPlatforms.platforms) {
      const addedDomains = savedPlatforms.domains[saved.id] || [];
      platforms.push({ ...saved, icon: 'fa-solid fa-globe', color: '#4285f4', bg: '#eaf2ff', domains: [...addedDomains], addedDomains, note: 'Your custom platform' });
    }
    platforms.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
    includeAddedDomainRules(Object.values(savedPlatforms.domains).flat());
    coreStatus = await window.desktop.coreStatus();
    autoSaveReady = true;
    if (dirty) scheduleAutoSave();
    render();
  } catch (error) {
    content.innerHTML = `<div class="load-error"><h1>Unable to load the core configuration</h1><p>${esc(error.message)}</p><p>Set ST_CORE_DIR to the st-core folder and ensure Python 3 with PyYAML is installed.</p></div>`;
    toast(error.message, true);
  }
})();
