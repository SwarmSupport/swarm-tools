// Older app versions saved temporary, unprivileged listener ports on macOS.
// Restore the standard ports so DNS answers pointing at localhost can reach
// the gateway without a port in the URL.
const legacyPorts = {
  https_listen: [8443, 443],
  http_listen: [8081, 80],
  'dns.listen': [8053, 53]
};

function restoreDefaultPorts(config) {
  const changed = [];
  for (const [key, [legacy, standard]] of Object.entries(legacyPorts)) {
    const parts = key.split('.');
    const owner = parts.length === 1 ? config : config[parts[0]];
    const field = parts.at(-1);
    const address = owner?.[field];
    if (typeof address !== 'string') continue;
    const match = /^(127\.0\.0\.1|localhost):(\d+)$/.exec(address);
    if (!match || Number(match[2]) !== legacy) continue;
    owner[field] = `${match[1]}:${standard}`;
    changed.push(`${key}: ${address} → ${owner[field]}`);
  }
  return changed;
}

module.exports = { restoreDefaultPorts };
