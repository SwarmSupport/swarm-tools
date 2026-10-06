const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const source = process.env.ST_CORE_DIR || path.join(__dirname, '..', 'st-core');
const destination = path.join(__dirname, '..', 'bin', process.platform === 'win32' ? 'st-core.exe' : 'st-core');
fs.mkdirSync(path.dirname(destination), { recursive: true });
const env = { ...process.env, GOCACHE: process.env.GOCACHE || path.join(os.tmpdir(), 'swarm-tools-go-cache') };
const result = spawnSync('go', ['build', '-o', destination, './cmd/st-core'], { cwd: source, stdio: 'inherit', env });
if (result.error) {
  console.error(`Unable to build st-core: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
