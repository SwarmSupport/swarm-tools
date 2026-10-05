const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { app, BrowserWindow, ipcMain, nativeTheme, shell } = require('electron');
const { restoreDefaultPorts } = require('./mac-ports');
const { readSystemSettings, writeSystemSettings } = require('./system-settings');
const { startSystemIntegration } = require('./mac-system');
const { caPaths, generateOrRegenerateCA } = require('./ca-manager');

app.setName('Swarm Tools');
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
else app.on('second-instance', () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); }
});

let iconThemePreference = 'system';
function appIconPath() {
  const dark = iconThemePreference === 'system' ? nativeTheme.shouldUseDarkColors : iconThemePreference === 'dark';
  return path.join(__dirname, 'assets', dark ? 'app-icon-dark.png' : 'app-icon.png');
}
function updateDockIcon() {
  if (process.platform === 'darwin') app.dock.setIcon(appIconPath());
}

const coreDirectory = process.env.ST_CORE_DIR || '/Users/xiaoyuan/Documents/st-core';
const binaryName = process.platform === 'win32' ? 'st-core.exe' : 'st-core';
const builtCoreBinary = path.join(__dirname, 'bin', binaryName);
const coreBinary = fs.existsSync(builtCoreBinary) ? builtCoreBinary : path.join(coreDirectory, binaryName);
const sourceConfig = path.join(coreDirectory, 'config.yaml');
let coreProcess = null;
let systemSession = null;
let coreStarting = false;
let caBusy = false;
let logLines = [];
let lastError = '';

function configPath() {
  return path.join(app.getPath('userData'), 'config.yaml');
}

function platformStore(operation, data = {}) {
  return new Promise((resolve, reject) => {
    const database = path.join(app.getPath('userData'), 'platforms.sqlite3');
    const child = spawn(process.env.PYTHON || 'python3', [path.join(__dirname, 'platform_store.py'), operation, database], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let errors = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { errors += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(errors.trim() || `Platform storage exited with ${code}`));
      try { resolve(JSON.parse(output)); } catch (error) { reject(error); }
    });
    child.stdin.end(JSON.stringify(data));
  });
}

function broadcast() {
  const status = { running: Boolean(coreProcess), starting: coreStarting, pid: coreProcess?.pid || null, error: lastError, logs: logLines.slice(-80) };
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send('core-status', status);
  return status;
}

function appendLog(data) {
  logLines.push(...String(data).split(/\r?\n/).filter(Boolean));
  logLines = logLines.slice(-200);
  broadcast();
}

function pythonYaml(operation, file, data) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.PYTHON || 'python3', [path.join(__dirname, 'config_bridge.py'), operation, file], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let errors = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { errors += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error(errors.trim() || `YAML bridge exited with ${code}`)));
    child.stdin.end(data === undefined ? undefined : JSON.stringify(data));
  });
}

function coreCommand(file, args) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(coreBinary)) return reject(new Error(`Core executable not found: ${coreBinary}. Run npm run build:core.`));
    const child = spawn(coreBinary, ['-config', file, ...args], { cwd: coreDirectory, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let errors = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { errors += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output.trim()) : reject(new Error([output.trim(), errors.trim()].filter(Boolean).join('\n') || `st-core exited with ${code}`)));
  });
}

async function loadConfig() {
  const file = fs.existsSync(configPath()) ? configPath() : sourceConfig;
  const raw = await pythonYaml('read', file);
  const config = JSON.parse(raw);
  if (process.platform === 'darwin') {
    const changes = restoreDefaultPorts(config);
    if (changes.length) {
      if (file === configPath()) fs.copyFileSync(file, `${file}.before-standard-port-migration`);
      const saved = await saveConfig(config, { allowWhileStarting: true });
      appendLog(`macOS listener ports restored to standard ports: ${changes.join(', ')}`);
      return { config, file: saved, source: false };
    }
  }
  return { config, file, source: file === sourceConfig };
}

async function saveConfig(config, { allowWhileStarting = false } = {}) {
  if (coreProcess || (coreStarting && !allowWhileStarting)) throw new Error('Stop the core before saving changes.');
  const target = configPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.tmp`;
  try {
    await pythonYaml('write', temp, config);
    await coreCommand(temp, ['check']);
    fs.renameSync(temp, target);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
  return target;
}

function createWindow() {
  const window = new BrowserWindow({
    width: 960, height: 720, minWidth: 960, minHeight: 650,
    title: 'Swarm Tools', icon: appIconPath(), backgroundColor: '#f7f9fc',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 12, y: 11 } } : {}),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'https://github.com/XiaoYuan151') shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.loadFile(path.join(__dirname, 'index.html'));
}

if (primaryInstance) app.whenReady().then(() => {
  updateDockIcon();
  nativeTheme.on('updated', updateDockIcon);
  ipcMain.on('appearance:set', (_event, preference) => {
    if (!['system', 'light', 'dark'].includes(preference)) return;
    iconThemePreference = preference;
    updateDockIcon();
  });
  ipcMain.handle('config:load', loadConfig);
  ipcMain.handle('config:save', (_event, config) => saveConfig(config));
  ipcMain.handle('config:prepare-reset', async () => {
    const config = JSON.parse(await pythonYaml('read', sourceConfig));
    if (process.platform === 'darwin') restoreDefaultPorts(config);
    let backupPath = null;
    if (fs.existsSync(configPath())) {
      const base = `${configPath()}.before-reset`;
      backupPath = base;
      for (let number = 2; fs.existsSync(backupPath); number++) backupPath = `${base}-${number}`;
      fs.copyFileSync(configPath(), backupPath);
    }
    return { config, backupPath };
  });
  ipcMain.handle('platforms:load', () => platformStore('list'));
  ipcMain.handle('platforms:add', (_event, name) => platformStore('add_platform', { name }));
  ipcMain.handle('platforms:add-domain', (_event, platformId, domain) => platformStore('add_domain', { platformId, domain }));
  ipcMain.handle('platforms:remove-domain', (_event, platformId, domain) => platformStore('remove_domain', { platformId, domain }));
  ipcMain.handle('system-settings:load', () => readSystemSettings(app.getPath('userData')));
  ipcMain.handle('system-settings:save', (_event, settings) => writeSystemSettings(app.getPath('userData'), settings));
  ipcMain.handle('core:ca-status', async () => {
    const file = fs.existsSync(configPath()) ? configPath() : sourceConfig;
    const config = JSON.parse(await pythonYaml('read', file));
    const { certPath, keyPath } = caPaths(config, coreDirectory);
    const certExists = fs.existsSync(certPath);
    const keyExists = fs.existsSync(keyPath);
    return { exists: certExists || keyExists };
  });
  ipcMain.handle('core:generate-ca', async () => {
    if (coreProcess || coreStarting) throw new Error('Stop the network service before regenerating its CA.');
    if (caBusy) throw new Error('CA generation is already in progress.');
    caBusy = true;
    try {
      const file = fs.existsSync(configPath()) ? configPath() : sourceConfig;
      const config = JSON.parse(await pythonYaml('read', file));
      return await generateOrRegenerateCA({ config, coreDirectory, generate: () => coreCommand(file, ['ca', 'generate']) });
    } finally { caBusy = false; }
  });
  ipcMain.handle('core:trust-ca', async () => coreCommand(fs.existsSync(configPath()) ? configPath() : sourceConfig, ['ca', 'install']));
  ipcMain.handle('core:speedtest', async (_event, targets) => {
    if (!Array.isArray(targets) || targets.length === 0 || targets.length > 1024 || targets.some(target => typeof target !== 'string' || target.length > 100 || !/^[0-9a-fA-F.:[\]\/]+$/.test(target))) {
      throw new Error('Enter IP:port addresses or IPv4 CIDR ranges.');
    }
    const output = await coreCommand(fs.existsSync(configPath()) ? configPath() : sourceConfig, ['speedtest', ...targets]);
    appendLog(output);
    return output;
  });
  ipcMain.handle('core:status', broadcast);
  ipcMain.handle('core:start', async () => {
    if (coreProcess) return broadcast();
    if (coreStarting) throw new Error('The network service is already starting.');
    if (!fs.existsSync(coreBinary)) throw new Error(`Core executable not found: ${coreBinary}`);
    lastError = '';
    logLines = [];
    coreStarting = true;
    broadcast();
    try {
    const { file } = await loadConfig();
    const settings = readSystemSettings(app.getPath('userData'));
    if (settings.enabled && (settings.hosts || settings.proxy || settings.dns)) {
      if (process.platform !== 'darwin') throw new Error('Automatic system integration is currently supported on macOS only.');
      const config = JSON.parse(await pythonYaml('read', file));
      systemSession = await startSystemIntegration(config, settings, {
        userData: app.getPath('userData'), coreBinary, coreDirectory,
        writeYaml: (target, value) => pythonYaml('write', target, value),
        checkConfig: target => coreCommand(target, ['check'])
      });
      coreProcess = systemSession.child;
      let logged = 0;
      const collectSystemLog = () => {
        try {
          const output = fs.readFileSync(systemSession.logPath, 'utf8');
          if (output.length > logged) appendLog(output.slice(logged));
          logged = output.length;
        } catch (error) { if (error.code !== 'ENOENT') appendLog(error.message); }
      };
      const logTimer = setInterval(collectSystemLog, 800);
      coreProcess.once('exit', code => {
        clearInterval(logTimer);
        collectSystemLog();
        try {
          const status = JSON.parse(fs.readFileSync(systemSession.statusPath, 'utf8'));
          if (status.state === 'error') lastError = status.error;
        } catch { /* The helper may exit before it writes status. */ }
        coreProcess = null;
        systemSession = null;
        if (code && !lastError) lastError = logLines.at(-1) || `System helper exited with code ${code}.`;
        broadcast();
      });
      collectSystemLog();
      coreStarting = false;
      return broadcast();
    }
    const child = spawn(coreBinary, ['-config', file, 'start', 'all'], { cwd: coreDirectory, stdio: ['ignore', 'pipe', 'pipe'] });
    coreProcess = child;
    child.stdout.on('data', appendLog);
    child.stderr.on('data', appendLog);
    child.on('error', error => { lastError = error.message; if (coreProcess === child) coreProcess = null; broadcast(); });
    child.on('exit', code => {
      if (coreProcess === child) coreProcess = null;
      if (code && code !== 0 && !lastError) lastError = logLines.at(-1) || `Core exited with code ${code}.`;
      broadcast();
    });
    await new Promise(resolve => setTimeout(resolve, 500));
    if (!coreProcess) throw new Error(lastError || 'Core stopped during startup. Check the activity log.');
    coreStarting = false;
    return broadcast();
    } catch (error) {
      lastError = error.message;
      throw error;
    } finally { coreStarting = false; broadcast(); }
  });
  ipcMain.handle('core:stop', async () => {
    if (systemSession) {
      const session = systemSession;
      fs.writeFileSync(session.stopPath, 'stop');
      await new Promise((resolve, reject) => {
        if (session.child.exitCode !== null) return resolve();
        const timeout = setTimeout(() => reject(new Error('Timed out restoring macOS network settings.')), 30000);
        session.child.once('exit', () => { clearTimeout(timeout); resolve(); });
      });
      try {
        const status = JSON.parse(fs.readFileSync(session.statusPath, 'utf8'));
        if (status.state === 'error') throw new Error(status.error);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    } else if (coreProcess) {
      const child = coreProcess;
      if (child.exitCode === null && child.signalCode === null) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Timed out stopping the network service.')), 30000);
          child.once('exit', () => { clearTimeout(timeout); resolve(); });
          if (!child.kill('SIGINT')) { clearTimeout(timeout); reject(new Error('Could not stop the network service.')); }
        });
      }
    }
    return broadcast();
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('before-quit', () => {
  if (systemSession) fs.writeFileSync(systemSession.stopPath, 'stop');
  else coreProcess?.kill('SIGINT');
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
