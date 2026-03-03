const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  login: () => ipcRenderer.invoke('auth-login'),
  logout: () => ipcRenderer.invoke('auth-logout'),
  getUser: () => ipcRenderer.invoke('auth-get-user'),
  saveDailyCompletion: (data) => ipcRenderer.invoke('daily-save', data),
  getDailyCompletion: (date) => ipcRenderer.invoke('daily-get', date),
  getLeaderboard: (date) => ipcRenderer.invoke('leaderboard-get', date),
  quit: () => ipcRenderer.invoke('app-quit'),
});
