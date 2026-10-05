const fs = require('node:fs');
const path = require('node:path');

const defaults = Object.freeze({ enabled: false, hosts: false, proxy: false, dns: true });

function singleMethod(settings) {
  const method = settings.dns ? 'dns' : settings.proxy ? 'proxy' : settings.hosts ? 'hosts' : 'dns';
  return { hosts: method === 'hosts', proxy: method === 'proxy', dns: method === 'dns' };
}

function readSystemSettings(userData) {
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(userData, 'system-settings.json'), 'utf8'));
    const settings = {
      hosts: saved?.hosts === true,
      proxy: saved?.proxy === true || (saved?.proxy === undefined && saved?.proxyDns === true),
      dns: saved?.dns === true || (saved?.dns === undefined && saved?.proxyDns === true)
    };
    return { enabled: typeof saved?.enabled === 'boolean' ? saved.enabled : Object.values(settings).some(Boolean), ...singleMethod(settings) };
  } catch (error) {
    if (error.code === 'ENOENT') return { ...defaults };
    throw error;
  }
}

function writeSystemSettings(userData, input) {
  if (!input || ['enabled', 'hosts', 'proxy', 'dns'].some(key => typeof input[key] !== 'boolean')) {
    throw new Error('Invalid system settings.');
  }
  if (['hosts', 'proxy', 'dns'].filter(key => input[key]).length !== 1) {
    throw new Error('Select exactly one connection method.');
  }
  const settings = { enabled: input.enabled, hosts: input.hosts, proxy: input.proxy, dns: input.dns };
  fs.mkdirSync(userData, { recursive: true });
  const target = path.join(userData, 'system-settings.json');
  const temp = `${target}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(settings, null, 2), { mode: 0o600 });
    fs.renameSync(temp, target);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
  return settings;
}

module.exports = { readSystemSettings, writeSystemSettings };
