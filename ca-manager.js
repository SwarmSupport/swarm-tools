const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function caPaths(config, coreDirectory) {
  const cert = config?.ca?.cert;
  const key = config?.ca?.key;
  if (typeof cert !== 'string' || !cert.trim() || typeof key !== 'string' || !key.trim()) {
    throw new Error('Configure both ca.cert and ca.key before generating a CA.');
  }
  const certPath = path.resolve(coreDirectory, cert);
  const keyPath = path.resolve(coreDirectory, key);
  if (certPath === keyPath) throw new Error('CA certificate and key paths must be different.');
  return { certPath, keyPath };
}

function fileExists(file) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile()) throw new Error(`CA path is not a regular file: ${file}`);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function validatePair(certPath, keyPath) {
  const certificate = new crypto.X509Certificate(fs.readFileSync(certPath));
  const privateKey = crypto.createPrivateKey(fs.readFileSync(keyPath));
  const publicFromKey = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  const publicFromCert = certificate.publicKey.export({ type: 'spki', format: 'der' });
  if (!publicFromCert.equals(publicFromKey)) throw new Error('Generated CA certificate and key do not match.');
}

async function generateOrRegenerateCA({ config, coreDirectory, generate, validate = validatePair }) {
  const { certPath, keyPath } = caPaths(config, coreDirectory);
  const files = [certPath, keyPath];
  const existed = new Map(files.map(file => [file, fileExists(file)]));
  const regenerated = [...existed.values()].some(Boolean);
  const suffix = `.before-regeneration-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}`;
  const backups = new Map();
  try {
    for (const file of files) {
      if (!existed.get(file)) continue;
      const backup = file + suffix;
      fs.renameSync(file, backup);
      backups.set(file, backup);
    }
    await generate();
    validate(certPath, keyPath);
    return { regenerated, backups: [...backups.values()] };
  } catch (error) {
    const rollbackErrors = [];
    for (const file of files) {
      if (!backups.has(file) && existed.get(file)) continue;
      try { if (fileExists(file)) fs.unlinkSync(file); }
      catch (cleanupError) { rollbackErrors.push(cleanupError.message); }
    }
    for (const [file, backup] of backups) {
      try { fs.renameSync(backup, file); }
      catch (restoreError) { rollbackErrors.push(restoreError.message); }
    }
    if (rollbackErrors.length) throw new Error(`${error.message} CA rollback also failed: ${rollbackErrors.join('; ')}`);
    throw error;
  }
}

module.exports = { caPaths, fileExists, validatePair, generateOrRegenerateCA };
