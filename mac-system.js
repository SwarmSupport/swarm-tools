const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const presetDomains = require('./preset-domains');

const siteDomains = Object.values(presetDomains).flat();

function localPort(address, label) {
  const match = /^(127\.0\.0\.1|localhost):(\d+)$/.exec(address || '');
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 65535) {
    throw new Error(`${label} must listen on 127.0.0.1 or localhost.`);
  }
  return Number(match[2]);
}

function runtimeConfig(config, settings) {
  const runtime = structuredClone(config);
  const checkPorts = [];
  if (settings.hosts || settings.dns) {
    if (runtime.routing?.mode === 'bypass') throw new Error('Hosts and system DNS integration require Rule or Global routing mode.');
    localPort(runtime.https_listen, 'HTTPS gateway');
    localPort(runtime.http_listen, 'HTTP gateway');
    runtime.https_listen = '127.0.0.1:443';
    runtime.http_listen = '127.0.0.1:80';
    checkPorts.push(443, 80);
  }
  let proxyPort = null;
  if (settings.proxy) {
    proxyPort = localPort(runtime.proxy?.http_listen, 'HTTP proxy');
    checkPorts.push(proxyPort);
  }
  if (settings.dns) {
    localPort(runtime.dns?.listen, 'DNS server');
    runtime.dns.listen = '127.0.0.1:53';
    checkPorts.push(53);
  }
  return { runtime, checkPorts: [...new Set(checkPorts)], proxyPort };
}

function managedDomains(config) {
  const configured = Object.keys(config.origin?.domains || {}).filter(domain => !domain.startsWith('*.'));
  const routed = (config.routing?.rules || []).map(rule => /^\|\|([a-z0-9.-]+)$/.exec(rule)?.[1]).filter(Boolean);
  return [...new Set([...siteDomains, ...configured, ...routed])].filter(domain => /^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/i.test(domain)).sort();
}

function startHelper(requestPath) {
  const script = [
    'on run argv',
    'set commandText to quoted form of item 1 of argv & " " & quoted form of item 2 of argv & " " & quoted form of item 3 of argv',
    'with timeout of 86400 seconds',
    'do shell script commandText with administrator privileges',
    'end timeout',
    'end run'
  ];
  return spawn('/usr/bin/osascript', [...script.flatMap(line => ['-e', line]), '/usr/bin/python3', path.join(__dirname, 'mac-system-helper.py'), requestPath], { stdio: ['ignore', 'pipe', 'pipe'] });
}

function waitForReady(child, statusPath) {
  return new Promise((resolve, reject) => {
    let finished = false;
    let errors = '';
    child.stderr.on('data', chunk => { errors += chunk; });
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      clearTimeout(timeout);
      if (error) reject(error); else resolve();
    };
    const timer = setInterval(() => {
      try {
        const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
        if (status.state === 'ready') finish();
        if (status.state === 'error') finish(new Error(status.error || 'System integration failed.'));
      } catch (error) {
        if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) finish(error);
      }
    }, 300);
    const timeout = setTimeout(() => finish(new Error('Timed out waiting for macOS administrator approval.')), 180000);
    child.once('exit', code => finish(new Error(errors.trim() || `System helper exited with code ${code}.`)));
    child.once('error', finish);
  });
}

async function startSystemIntegration(config, settings, options) {
  const { runtime, checkPorts, proxyPort } = runtimeConfig(config, settings);
  if (settings.hosts || settings.dns) {
    const certificate = path.resolve(options.coreDirectory, config.ca?.cert || '');
    const trusted = spawnSync('/usr/bin/security', ['verify-cert', '-c', certificate, '-p', 'basic', '-l', '-q']);
    if (trusted.status !== 0) throw new Error('Trust the gateway CA in Settings before enabling hosts or system DNS routing.');
  }
  const directory = options.userData;
  fs.mkdirSync(directory, { recursive: true });
  const runtimePath = path.join(directory, 'system-runtime.yaml');
  const requestPath = path.join(directory, 'system-request.json');
  const statusPath = path.join(directory, 'system-status.json');
  const stopPath = path.join(directory, 'system-stop');
  const logPath = path.join(directory, 'system-core.log');
  for (const file of [statusPath, stopPath, logPath]) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  await options.writeYaml(runtimePath, runtime);
  await options.checkConfig(runtimePath);
  const request = {
    coreBinary: options.coreBinary,
    coreDirectory: options.coreDirectory,
    configPath: runtimePath,
    appPid: process.pid,
    logPath, statusPath, stopPath,
    hosts: settings.hosts,
    proxy: settings.proxy,
    dns: settings.dns,
    hostsDomains: settings.hosts ? managedDomains(config) : [],
    proxyPort, checkPorts
  };
  fs.writeFileSync(requestPath, JSON.stringify(request), { mode: 0o600 });
  const child = startHelper(requestPath);
  try {
    await waitForReady(child, statusPath);
    if (child.exitCode !== null) throw new Error('System helper stopped during startup.');
    return { child, stopPath, logPath, statusPath };
  } catch (error) {
    fs.writeFileSync(stopPath, 'stop');
    if (child.exitCode === null) {
      await Promise.race([
        new Promise(resolve => child.once('exit', resolve)),
        new Promise(resolve => setTimeout(resolve, 30000))
      ]);
    }
    throw error;
  }
}

module.exports = { runtimeConfig, managedDomains, startSystemIntegration };
