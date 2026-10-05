const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  setAppearance: preference => ipcRenderer.send('appearance:set', preference),
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: config => ipcRenderer.invoke('config:save', config),
  prepareConfigReset: () => ipcRenderer.invoke('config:prepare-reset'),
  loadPlatforms: () => ipcRenderer.invoke('platforms:load'),
  addPlatform: name => ipcRenderer.invoke('platforms:add', name),
  addPlatformDomain: (platformId, domain) => ipcRenderer.invoke('platforms:add-domain', platformId, domain),
  removePlatformDomain: (platformId, domain) => ipcRenderer.invoke('platforms:remove-domain', platformId, domain),
  loadSystemSettings: () => ipcRenderer.invoke('system-settings:load'),
  saveSystemSettings: settings => ipcRenderer.invoke('system-settings:save', settings),
  generateCA: () => ipcRenderer.invoke('core:generate-ca'),
  caStatus: () => ipcRenderer.invoke('core:ca-status'),
  trustCA: () => ipcRenderer.invoke('core:trust-ca'),
  speedtest: targets => ipcRenderer.invoke('core:speedtest', targets),
  startCore: () => ipcRenderer.invoke('core:start'),
  stopCore: () => ipcRenderer.invoke('core:stop'),
  coreStatus: () => ipcRenderer.invoke('core:status'),
  onCoreStatus: callback => ipcRenderer.on('core-status', (_event, status) => callback(status))
});
