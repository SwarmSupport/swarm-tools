const test = require('node:test');
const assert = require('node:assert/strict');
const { restoreDefaultPorts } = require('../mac-ports');

test('restores legacy macOS gateway and DNS defaults', () => {
  const config = {
    https_listen: '127.0.0.1:8443',
    http_listen: '127.0.0.1:8081',
    dns: { listen: '127.0.0.1:8053' },
    proxy: { http_listen: '127.0.0.1:8080', socks5_listen: '127.0.0.1:1080' }
  };
  assert.equal(restoreDefaultPorts(config).length, 3);
  assert.equal(config.https_listen, '127.0.0.1:443');
  assert.equal(config.http_listen, '127.0.0.1:80');
  assert.equal(config.dns.listen, '127.0.0.1:53');
  assert.equal(config.proxy.http_listen, '127.0.0.1:8080');
  assert.deepEqual(restoreDefaultPorts(config), []);
});

test('preserves custom ports and nonlocal listeners', () => {
  const config = {
    https_listen: '127.0.0.1:9443',
    http_listen: '0.0.0.0:8081',
    dns: { listen: '127.0.0.1:9053' }
  };
  assert.deepEqual(restoreDefaultPorts(config), []);
});

test('restores legacy localhost listeners', () => {
  const config = { http_listen: 'localhost:8081', dns: { listen: 'localhost:8053' } };
  restoreDefaultPorts(config);
  assert.equal(config.http_listen, 'localhost:80');
  assert.equal(config.dns.listen, 'localhost:53');
});
