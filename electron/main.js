const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const auth = require('./auth');
const api = require('./api');

function createWindow() {
  const win = new BrowserWindow({
    width: 820,
    height: 720,
    minWidth: 560,
    minHeight: 600,
    fullscreen: true,
    title: 'Sudoku',
    backgroundColor: '#0f0e17',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.once('ready-to-show', () => win.show());
}

app.whenReady().then(() => {
  ipcMain.handle('auth-login', () => auth.login());
  ipcMain.handle('auth-logout', () => auth.logout());
  ipcMain.handle('auth-get-user', () => auth.getUser());
  ipcMain.handle('daily-save', (_, data) => api.saveDailyCompletion(data));
  ipcMain.handle('daily-get', (_, date) => api.getDailyCompletion(date));
  ipcMain.handle('leaderboard-get', (_, date) => api.getLeaderboard(date));
  ipcMain.handle('app-quit', () => app.quit());
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
