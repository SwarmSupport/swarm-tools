const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runtimeConfig, managedDomains } = require('../mac-system');
const { readSystemSettings, writeSystemSettings } = require('../system-settings');

const config = {
  https_listen: '127.0.0.1:8443',
  http_listen: '127.0.0.1:8081',
  dns: { listen: '127.0.0.1:8053' },
  proxy: { http_listen: '127.0.0.1:8080' },
  routing: { mode: 'rule' },
  origin: { domains: { 'example.com': ['1.1.1.1'], '*.example.com': ['1.1.1.1'] } }
};

test('privileged runtime uses standard ports without modifying saved config', () => {
  const { runtime, checkPorts, proxyPort } = runtimeConfig(config, { hosts: true, proxy: true, dns: true });
  assert.equal(runtime.https_listen, '127.0.0.1:443');
  assert.equal(runtime.http_listen, '127.0.0.1:80');
  assert.equal(runtime.dns.listen, '127.0.0.1:53');
  assert.equal(proxyPort, 8080);
  assert.deepEqual(checkPorts, [443, 80, 8080, 53]);
  assert.equal(config.https_listen, '127.0.0.1:8443');
  assert.equal(config.dns.listen, '127.0.0.1:8053');
});

test('hosts integration rejects bypass mode and nonlocal gateway listeners', () => {
  assert.throws(() => runtimeConfig({ ...config, routing: { mode: 'bypass' } }, { hosts: true, proxy: false, dns: false }), /Rule or Global/);
  assert.throws(() => runtimeConfig({ ...config, https_listen: '0.0.0.0:8443' }, { hosts: true, proxy: false, dns: false }), /must listen/);
});

test('proxy and DNS listeners can be enabled independently', () => {
  const proxyOnly = runtimeConfig(config, { hosts: false, proxy: true, dns: false });
  assert.equal(proxyOnly.runtime.dns.listen, '127.0.0.1:8053');
  assert.deepEqual(proxyOnly.checkPorts, [8080]);
  const dnsOnly = runtimeConfig(config, { hosts: false, proxy: false, dns: true });
  assert.equal(dnsOnly.runtime.https_listen, '127.0.0.1:443');
  assert.equal(dnsOnly.runtime.http_listen, '127.0.0.1:80');
  assert.equal(dnsOnly.runtime.dns.listen, '127.0.0.1:53');
  assert.equal(dnsOnly.proxyPort, null);
  assert.deepEqual(dnsOnly.checkPorts, [443, 80, 53]);
});

test('managed hosts include known sites and exact configured domains', () => {
  const domains = managedDomains({ ...config, routing: { mode: 'rule', rules: ['||custom.example', '||custom.example^', 'other'] } });
  assert.ok(domains.includes('discord.com'));
  assert.ok(domains.includes('example.com'));
  assert.ok(domains.includes('custom.example'));
  assert.ok(!domains.includes('*.example.com'));
});

test('routing switch and one selected method persist independently of core config', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-system-settings-'));
  try {
    assert.deepEqual(readSystemSettings(directory), { enabled: false, hosts: false, proxy: false, dns: true });
    assert.deepEqual(writeSystemSettings(directory, { enabled: true, hosts: true, proxy: false, dns: false }), { enabled: true, hosts: true, proxy: false, dns: false });
    assert.deepEqual(readSystemSettings(directory), { enabled: true, hosts: true, proxy: false, dns: false });
    assert.deepEqual(writeSystemSettings(directory, { enabled: false, hosts: true, proxy: false, dns: false }), { enabled: false, hosts: true, proxy: false, dns: false });
    assert.throws(() => writeSystemSettings(directory, { enabled: true, hosts: 'yes', proxy: false, dns: false }), /Invalid/);
    assert.throws(() => writeSystemSettings(directory, { enabled: true, hosts: true, proxy: false, dns: true }), /exactly one/);
    assert.throws(() => writeSystemSettings(directory, { enabled: true, hosts: false, proxy: false, dns: false }), /exactly one/);
    fs.writeFileSync(path.join(directory, 'system-settings.json'), JSON.stringify({ hosts: false, proxyDns: true }));
    assert.deepEqual(readSystemSettings(directory), { enabled: true, hosts: false, proxy: false, dns: true });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
