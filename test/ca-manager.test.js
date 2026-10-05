const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { caPaths, generateOrRegenerateCA } = require('../ca-manager');

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-ca-'));
  const config = { ca: { cert: 'ca.crt', key: 'ca.key' } };
  const { certPath, keyPath } = caPaths(config, directory);
  return { directory, config, certPath, keyPath, cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
}

test('regenerates an existing pair and preserves both backups', async () => {
  const files = fixture();
  try {
    fs.writeFileSync(files.certPath, 'old certificate');
    fs.writeFileSync(files.keyPath, 'old private key', { mode: 0o600 });
    const result = await generateOrRegenerateCA({
      config: files.config,
      coreDirectory: files.directory,
      generate: async () => {
        fs.writeFileSync(files.certPath, 'new certificate');
        fs.writeFileSync(files.keyPath, 'new private key');
      },
      validate: () => {}
    });
    assert.equal(result.regenerated, true);
    assert.equal(fs.readFileSync(files.certPath, 'utf8'), 'new certificate');
    assert.equal(fs.readFileSync(files.keyPath, 'utf8'), 'new private key');
    assert.deepEqual(result.backups.map(file => fs.readFileSync(file, 'utf8')), ['old certificate', 'old private key']);
  } finally { files.cleanup(); }
});

test('restores the original pair when regeneration fails after a partial write', async () => {
  const files = fixture();
  try {
    fs.writeFileSync(files.certPath, 'old certificate');
    fs.writeFileSync(files.keyPath, 'old private key');
    await assert.rejects(generateOrRegenerateCA({
      config: files.config,
      coreDirectory: files.directory,
      generate: async () => { fs.writeFileSync(files.certPath, 'partial certificate'); throw new Error('generation failed'); },
      validate: () => {}
    }), /generation failed/);
    assert.equal(fs.readFileSync(files.certPath, 'utf8'), 'old certificate');
    assert.equal(fs.readFileSync(files.keyPath, 'utf8'), 'old private key');
  } finally { files.cleanup(); }
});

test('creates a fresh pair without backups', async () => {
  const files = fixture();
  try {
    const result = await generateOrRegenerateCA({
      config: files.config,
      coreDirectory: files.directory,
      generate: async () => { fs.writeFileSync(files.certPath, 'certificate'); fs.writeFileSync(files.keyPath, 'key'); },
      validate: () => {}
    });
    assert.equal(result.regenerated, false);
    assert.deepEqual(result.backups, []);
  } finally { files.cleanup(); }
});
