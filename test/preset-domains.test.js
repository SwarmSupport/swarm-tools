const test = require('node:test');
const assert = require('node:assert/strict');
const presetDomains = require('../preset-domains');
const { managedDomains } = require('../mac-system');

test('preset domains are unique bare hostnames and are available to macOS hosts routing', () => {
  const managed = new Set(managedDomains({ routing: { rules: [] }, origin: { domains: {} } }));
  for (const [platform, domains] of Object.entries(presetDomains)) {
    assert.ok(domains.length > 0, `${platform} has no domains`);
    assert.equal(new Set(domains).size, domains.length, `${platform} has duplicate domains`);
    for (const domain of domains) {
      assert.match(domain, /^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/);
      assert.ok(managed.has(domain), `${domain} is missing from hosts routing`);
    }
  }
  assert.ok(presetDomains.discord.includes('discord-activities.com'));
  assert.ok(presetDomains.duckduckgo.includes('duckduckgo.co.uk'));
  assert.ok(presetDomains.github.includes('ghcr.io'));
  assert.ok(presetDomains.x.includes('twttr.net'));
});
