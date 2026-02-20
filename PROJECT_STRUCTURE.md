# Project Structure: Electron + Vite + React Desktop Game

This document describes the codebase structure for a desktop game built with **Electron**, **Vite**, and **React**. Use it as a template to create a new game with the same setup.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Electron 28.x |
| Build tool | Vite 5.x |
| UI framework | React 18.x |
| Packaging | electron-builder 24.x |

---

## Directory Structure

```
project-root/
├── electron/
│   └── main.js              # Electron main process (window, load URL/file)
├── src/
│   ├── main.jsx              # React entry point
│   ├── App.jsx               # Root component (wraps game)
│   ├── index.css             # Global styles
│   └── [GameName].jsx        # Main game component (replace with your game)
├── steam_assets/             # Optional: artwork for Steam library
│   ├── steam_grid.png        # 920×430
│   ├── steam_hero.png        # 1920×620
│   ├── steam_logo.png        # 1280×720
│   ├── steam_poster.png      # 600×900
│   └── HOW_TO_ADD_TO_STEAM.txt
├── index.html                # HTML shell (Vite entry)
├── package.json
├── vite.config.js
└── .gitignore
```

---

## Key Files

### `package.json`

```json
{
  "name": "your-game-name",
  "version": "1.0.0",
  "main": "electron/main.js",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "electron:dev": "concurrently \"vite\" \"wait-on http://localhost:5173 && electron .\"",
    "electron:build:win": "vite build && electron-builder --win",
    "dist:zip": "powershell -Command \"Compress-Archive -Path 'release/win-unpacked' -DestinationPath 'release/Game-Windows.zip' -Force\""
  },
  "build": {
    "appId": "com.yourgame.id",
    "productName": "YourGame",
    "directories": { "output": "release" },
    "files": ["dist/**/*", "electron/**/*"],
    "extraFiles": [{ "from": "steam_assets", "to": "SteamAssets" }],
    "win": {
      "target": "dir",
      "signAndEditExecutable": false
    }
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "concurrently": "^8.2.2",
    "electron": "^28.0.0",
    "electron-builder": "^24.9.1",
    "vite": "^5.0.0",
    "wait-on": "^7.2.0"
  }
}
```

- **`main`**: Points to Electron main process.
- **`electron:dev`**: Runs Vite dev server + Electron; Electron loads `http://localhost:5173`.
- **`electron:build:win`**: Builds React → `dist/`, then packages with electron-builder → `release/win-unpacked/`.
- **`win.target: "dir"`**: Produces unpacked folder (avoids code-signing tooling that can fail on Windows).
- **`extraFiles`**: Copies `steam_assets/` into the built app as `SteamAssets/`.

### `vite.config.js`

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',           // Relative paths for Electron file:// loading
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
```

- **`base: './'`**: Required so built assets load correctly when Electron serves from `file://`.

### `electron/main.js`

```javascript
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 560,
    height: 720,
    minWidth: 480,
    minHeight: 600,
    title: 'Your Game',
    backgroundColor: '#0f0e17',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.once('ready-to-show', () => win.show());
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
```

- **Dev**: Loads from Vite dev server.
- **Prod**: Loads `dist/index.html` from the built app.

### `index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Your Game</title>
    <!-- Optional: Google Fonts -->
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

### `src/main.jsx`

```javascript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### `src/App.jsx`

```javascript
import YourGame from './YourGame';

export default function App() {
  return <YourGame />;
}
```

### `src/index.css`

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Your Font', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#root {
  min-height: 100vh;
}
```

---

## Game Component Pattern

The main game lives in a single React component (e.g. `src/Sudoku.jsx`):

- **State**: `useState` for screens, game data, UI state.
- **Effects**: `useEffect` for timers, keyboard listeners, cleanup.
- **Refs**: `useRef` for intervals/timeouts that need cleanup.
- **Styling**: Inline `style={{}}` objects or a shared palette object.
- **Screens**: Conditional render by screen state (e.g. `menu`, `game`, `over`, `win`).

No external UI library; plain React + inline styles.

---

## Build Output

After `npm run electron:build:win`:

```
release/
└── win-unpacked/
    ├── YourGame.exe
    ├── ffmpeg.dll
    ├── chrome_100_percent.pak
    ├── ... (other Electron runtime files)
    ├── resources/
    │   └── app.asar          # Bundled app code
    └── SteamAssets/          # If extraFiles configured
        ├── steam_grid.png
        └── ...
```

**Distribution**: Zip the entire `win-unpacked` folder. Recipients must run the `.exe` from inside the extracted folder (it depends on sibling DLLs and resources).

---

## Scripts Summary

| Command | Purpose |
|---------|---------|
| `npm run dev` | Web only: Vite dev server at localhost:5173 |
| `npm run electron:dev` | Desktop: Vite + Electron, hot reload |
| `npm run electron:build:win` | Build Windows .exe in `release/win-unpacked/` |
| `npm run dist:zip` | Create `release/Game-Windows.zip` (close app first) |

---

## .gitignore

```
node_modules/
dist/
release/
out/
*.log
.DS_Store
Thumbs.db
.idea/
.vscode/
.env
.env.local
```

---

## Steam Integration (Optional)

1. Add game to Steam as non-Steam game → point to `YourGame.exe`.
2. Right‑click → Manage → Set custom artwork.
3. Use images from `SteamAssets/` (grid, hero, logo, poster).

Steam does not auto-detect artwork; users add it manually.
