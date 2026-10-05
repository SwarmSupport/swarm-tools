const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const renderer = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');

async function fixture(mode, running, failStart = false, savedPlatforms = { domains: {}, platforms: [] }) {
  const handlers = {};
  const timers = new Map();
  let nextTimerId = 0;
  const localValues = new Map([['swarm-last-active-routing-mode', 'global']]);
  const elements = new Map();
  function element(name) {
    if (!elements.has(name)) elements.set(name, {
      innerHTML: '', textContent: '', className: '', disabled: false,
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(type, callback) { handlers[`${name}:${type}`] = callback; },
      setAttribute() {},
      querySelectorAll() { return []; },
      querySelector() { return null; }
    });
    return elements.get(name);
  }
  const baseConfig = {
    routing: { mode, rules: [], rule_list_url: 'https://example.com/list' },
    dns: { doh_server: 'https://example.com/dns-query', direct_doh_server: 'https://example.com/dns-query' },
    origin: { lists: {}, domains: {} }
  };
  let savedConfig = structuredClone(baseConfig);
  const defaultConfig = structuredClone(baseConfig);
  defaultConfig.routing.mode = 'rule';
  defaultConfig.dns.doh_server = 'https://default.example/dns-query';
  let domains = structuredClone(savedPlatforms.domains);
  let savedSettings = { enabled: mode !== 'bypass', hosts: false, proxy: false, dns: true };
  let serviceRunning = running;
  let starts = 0;
  let stops = 0;
  let resetPrepared = 0;
  let confirmReset = true;
  let statusCallback;
  const bridge = {
    platform: 'darwin', setAppearance() {},
    loadConfig: async () => ({ config: structuredClone(savedConfig), file: '/tmp/config.yaml' }),
    saveConfig: async next => { savedConfig = structuredClone(next); return '/tmp/config.yaml'; },
    prepareConfigReset: async () => { resetPrepared++; return { config: structuredClone(defaultConfig), backupPath: '/tmp/config.yaml.before-reset' }; },
    loadSystemSettings: async () => ({ ...savedSettings }),
    saveSystemSettings: async next => { savedSettings = { ...next }; return { ...savedSettings }; },
    loadPlatforms: async () => ({ domains, platforms: savedPlatforms.platforms }),
    removePlatformDomain: async (platformId, domain) => {
      domains[platformId] = domains[platformId].filter(item => item !== domain);
      return { platformId, domain };
    },
    caStatus: async () => ({ exists: true }),
    coreStatus: async () => ({ running: serviceRunning, starting: false, logs: [], error: '' }),
    startCore: async () => {
      starts++;
      if (failStart) throw new Error('start failed');
      serviceRunning = true;
      statusCallback?.({ running: true, starting: false, logs: [], error: '' });
    },
    stopCore: async () => {
      stops++;
      serviceRunning = false;
      statusCallback?.({ running: false, starting: false, logs: [], error: '' });
    },
    onCoreStatus(callback) { statusCallback = callback; }
  };
  const document = {
    documentElement: { classList: { toggle() {} }, dataset: {} },
    querySelector: element,
    querySelectorAll: () => [],
    addEventListener(type, callback) { handlers[`document:${type}`] = callback; }
  };
  const context = vm.createContext({
    document, navigator: { platform: 'MacIntel' },
    window: { desktop: bridge, confirm: () => confirmReset, matchMedia: () => ({ matches: false, addEventListener() {} }) },
    localStorage: { getItem: key => localValues.get(key) ?? null, setItem: (key, value) => localValues.set(key, value) },
    structuredClone, URL, Intl,
    setTimeout: callback => { const id = ++nextTimerId; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id)
  });
  vm.runInContext(renderer, context);
  await new Promise(resolve => setImmediate(resolve));
  return {
    change: checked => handlers['#main-content:change']({ target: { dataset: { systemSetting: 'enabled' }, checked } }),
    openPlatform: platformId => handlers['document:click']({ target: { closest: selector => selector === '[data-page]' ? { dataset: { page: platformId } } : null } }),
    openSettings: () => handlers['document:click']({ target: { closest: selector => selector === '[data-page]' ? { dataset: { page: 'global' } } : null } }),
    resetConfig: () => {
      const button = { dataset: { action: 'reset-config' }, disabled: false };
      return handlers['document:click']({ target: { closest: selector => selector === '[data-action]' || selector === 'button' ? button : null } });
    },
    setConfirmReset: value => { confirmReset = value; },
    removeDomain: domain => {
      const button = { dataset: { action: 'remove-domain', domain }, disabled: false };
      return handlers['document:click']({ target: { closest: selector => selector === '[data-action]' || selector === 'button' ? button : null } });
    },
    selectMethod: method => handlers['#main-content:change']({ target: { dataset: { systemSetting: method }, checked: true } }),
    selectMode: value => handlers['#main-content:change']({ target: { dataset: { path: 'routing.mode' }, value, type: 'select-one' } }),
    runScheduledSaves: async () => {
      const pending = [...timers];
      for (const [id, callback] of pending) {
        timers.delete(id);
        await callback();
      }
    },
    state: () => ({ savedConfig, savedSettings, domains, serviceRunning, starts, stops, resetPrepared, markup: element('#main-content').innerHTML, saveStatus: element('#save-status').textContent })
  };
}

test('Rule mode stays selected when routing is turned off and back on', async () => {
  const app = await fixture('rule', true);
  await app.change(false);
  await app.change(true);
  assert.equal(app.state().savedConfig.routing.mode, 'rule');
  assert.equal(app.state().serviceRunning, true);
  assert.match(app.state().markup, /stat-word">rule/);
});

test('connection methods form a single choice and show the current choice in the row', async () => {
  const app = await fixture('rule', true);
  assert.match(app.state().markup, /routing-current-method">System DNS/);
  assert.doesNotMatch(app.state().markup, /rule · DNS/);
  assert.match(app.state().markup, /type="radio" name="connection-method"/);
  await app.selectMethod('proxy');
  assert.deepEqual(app.state().savedSettings, { enabled: true, hosts: false, proxy: true, dns: false });
  assert.match(app.state().markup, /routing-current-method">System proxy/);
  await app.selectMethod('hosts');
  assert.deepEqual(app.state().savedSettings, { enabled: true, hosts: true, proxy: false, dns: false });
  assert.match(app.state().markup, /routing-current-method">Hosts file/);
});

test('platform domains render A–Z and only added domains can be removed', async () => {
  const app = await fixture('rule', false, false, { domains: { discord: ['z.example.com', 'a.example.com'] }, platforms: [] });
  await app.openPlatform('discord');
  const initial = app.state().markup;
  assert.ok(initial.indexOf('a.example.com</strong>') < initial.indexOf('z.example.com</strong>'));
  assert.match(initial, /data-action="remove-domain" data-domain="a.example.com"/);
  assert.doesNotMatch(initial, /data-action="remove-domain" data-domain="discord.com"/);
  await app.removeDomain('z.example.com');
  assert.deepEqual(app.state().domains.discord, ['a.example.com']);
  assert.doesNotMatch(app.state().markup, /z\.example\.com<\/strong>/);
  await app.runScheduledSaves();
  assert.deepEqual(app.state().savedConfig.routing.rules, ['||a.example.com']);
  assert.equal(app.state().saveStatus, 'Saved');
});

test('routing switch saves Bypass and stops the service, then restores Global and starts it', async () => {
  const app = await fixture('global', true);
  await app.change(false);
  assert.equal(app.state().savedConfig.routing.mode, 'bypass');
  assert.equal(app.state().savedSettings.enabled, false);
  assert.equal(app.state().serviceRunning, false);
  assert.equal(app.state().stops, 1);
  assert.equal(app.state().starts, 0);
  assert.match(app.state().markup, /stat-word">bypass/);

  await app.change(true);
  assert.equal(app.state().savedConfig.routing.mode, 'global');
  assert.equal(app.state().savedSettings.enabled, true);
  assert.equal(app.state().serviceRunning, true);
  assert.equal(app.state().starts, 1);
  assert.match(app.state().markup, /stat-word">global/);
});

test('failed routing start restores Bypass and the previous macOS settings', async () => {
  const app = await fixture('bypass', false, true);
  await app.change(true);
  assert.equal(app.state().savedConfig.routing.mode, 'bypass');
  assert.equal(app.state().savedSettings.enabled, false);
  assert.equal(app.state().serviceRunning, false);
  assert.match(app.state().markup, /stat-word">bypass/);
});

test('changing Global mode in Settings saves automatically and starts the service', async () => {
  const app = await fixture('bypass', false);
  await app.selectMode('global');
  await app.runScheduledSaves();
  assert.equal(app.state().savedConfig.routing.mode, 'global');
  assert.equal(app.state().savedSettings.enabled, true);
  assert.equal(app.state().serviceRunning, true);
  assert.equal(app.state().saveStatus, 'Saved');
});

test('failed automatic apply restores saved settings and reports unsaved changes', async () => {
  const app = await fixture('bypass', false, true);
  await app.selectMode('global');
  await app.runScheduledSaves();
  assert.equal(app.state().savedConfig.routing.mode, 'bypass');
  assert.equal(app.state().savedSettings.enabled, false);
  assert.equal(app.state().saveStatus, 'Not saved');
});

test('Diagnostics reset restores source config and restarts active routing', async () => {
  const app = await fixture('global', true);
  await app.openSettings();
  assert.match(app.state().markup, /data-action="reset-config"/);
  await app.resetConfig();
  assert.equal(app.state().savedConfig.routing.mode, 'rule');
  assert.equal(app.state().savedConfig.dns.doh_server, 'https://default.example/dns-query');
  assert.equal(app.state().savedSettings.enabled, true);
  assert.equal(app.state().stops, 1);
  assert.equal(app.state().starts, 1);
  assert.equal(app.state().resetPrepared, 1);
  assert.equal(app.state().saveStatus, 'Saved');
});

test('cancelled Diagnostics reset leaves the config untouched', async () => {
  const app = await fixture('global', false);
  app.setConfirmReset(false);
  await app.resetConfig();
  assert.equal(app.state().savedConfig.routing.mode, 'global');
  assert.equal(app.state().resetPrepared, 0);
  assert.equal(app.state().starts, 0);
});
