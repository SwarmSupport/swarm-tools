const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { caPaths, generateOrRegenerateCA, prepareCAForStart } = require('../ca-manager');

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

test('first start generates and installs once', async () => {
  const files = fixture();
  const trustMarker = path.join(files.directory, 'trusted-ca.sha256');
  let generated = 0;
  let installed = 0;
  const options = {
    config: files.config, coreDirectory: files.directory, trustMarker,
    generate: async () => {
      generated++;
      fs.writeFileSync(files.certPath, 'certificate');
      fs.writeFileSync(files.keyPath, 'key');
    },
    install: async () => { installed++; },
    validate: () => {}
  };
  try {
    assert.deepEqual(await prepareCAForStart(options), { generated: true });
    assert.deepEqual(await prepareCAForStart(options), { generated: false });
    assert.equal(generated, 1);
    assert.equal(installed, 1);
  } finally { files.cleanup(); }
});

test('an incomplete CA pair fails without replacing either file', async () => {
  const files = fixture();
  try {
    fs.writeFileSync(files.certPath, 'certificate');
    await assert.rejects(prepareCAForStart({
      config: files.config, coreDirectory: files.directory,
      generate: async () => { throw new Error('must not generate'); }
    }), /both exist or both be absent/);
    assert.equal(fs.readFileSync(files.certPath, 'utf8'), 'certificate');
    assert.equal(fs.existsSync(files.keyPath), false);
  } finally { files.cleanup(); }
});

test('failed first-run generation removes partial CA files', async () => {
  const files = fixture();
  try {
    await assert.rejects(prepareCAForStart({
      config: files.config, coreDirectory: files.directory,
      generate: async () => { fs.writeFileSync(files.certPath, 'partial'); throw new Error('generation failed'); }
    }), /generation failed/);
    assert.equal(fs.existsSync(files.certPath), false);
    assert.equal(fs.existsSync(files.keyPath), false);
  } finally { files.cleanup(); }
});

test('failed trust installation retries on the next start', async () => {
  const files = fixture();
  const trustMarker = path.join(files.directory, 'trusted-ca.sha256');
  try {
    fs.writeFileSync(files.certPath, 'certificate');
    fs.writeFileSync(files.keyPath, 'key');
    let attempts = 0;
    const options = {
      config: files.config, coreDirectory: files.directory, trustMarker,
      generate: async () => { throw new Error('must not generate'); },
      install: async () => { if (++attempts === 1) throw new Error('trust failed'); },
      validate: () => {}
    };
    await assert.rejects(prepareCAForStart(options), /trust failed/);
    assert.equal(fs.existsSync(trustMarker), false);
    await prepareCAForStart(options);
    assert.equal(attempts, 2);
  } finally { files.cleanup(); }
});
