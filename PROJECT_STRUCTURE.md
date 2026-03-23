# Project Structure: Electron + Vite + React Desktop Game

This document describes the codebase structure for a desktop game built with **Electron**, **Vite**, and **React**, with an **AWS backend** for authentication and daily completion storage.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Electron 28.x |
| Build tool | Vite 5.x |
| UI framework | React 18.x |
| Packaging | electron-builder 24.x |
| Auth | AWS Cognito (OAuth 2.0 / OIDC) |
| API | AWS API Gateway (REST) |
| Backend | AWS Lambda + DynamoDB |

---

## Directory Structure

```
project-root/
├── electron/
│   ├── main.js               # Electron main process (window, IPC handlers)
│   ├── preload.js            # Context bridge: exposes electronAPI to renderer
│   ├── auth.js               # Cognito OAuth login, token storage, refresh
│   ├── api.js                # API client for daily completion endpoints
│   └── config.js             # AWS config (Cognito, API Gateway base URL)
├── lambda/
│   ├── dailyCompletion.mjs   # Lambda handler: PUT/GET daily completions, leaderboard
│   └── package.json         # Dependencies: @aws-sdk/client-dynamodb, lib-dynamodb
├── src/
│   ├── main.jsx              # React entry point
│   ├── App.jsx               # Root component (wraps game)
│   ├── index.css             # Global styles
│   ├── sounds.js             # Sound effects
│   └── Sudoku.jsx            # Main game component
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
- **`files`**: Includes `electron/**/*` (main, preload, auth, api, config).

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

### `lambda/package.json`

Separate package for the Lambda handler. Dependencies: `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`. `"type": "module"` for ES modules. Install and deploy from `lambda/` when updating the backend.

### `electron/main.js`

- Creates `BrowserWindow` with `preload.js` for secure IPC.
- Registers IPC handlers: `auth-login`, `auth-logout`, `auth-get-user`, `daily-save`, `daily-get`, `leaderboard-get`, `app-quit`.
- **Dev**: Loads from Vite dev server.
- **Prod**: Loads `dist/index.html` from the built app.

### `electron/preload.js`

Exposes `window.electronAPI` to the renderer (context-isolated):

| Method | Purpose |
|--------|---------|
| `login()` | Opens Cognito OAuth window, returns user |
| `logout()` | Clears stored tokens |
| `getUser()` | Returns current user or null |
| `saveDailyCompletion(data)` | PUT completion to API |
| `getDailyCompletion(date)` | GET user's completion for date |
| `getLeaderboard(date)` | GET leaderboard for date |
| `quit()` | Quits the app |

### `electron/auth.js`

- **Cognito OAuth 2.0** with PKCE (code verifier/challenge).
- Opens a `BrowserWindow` for the authorize flow; intercepts `http://localhost/callback`.
- Token storage: `cognito-tokens.json` in userData, encrypted via `safeStorage` when available.
- `getUser()`, `getAccessToken()`, `getIdToken()`, `refreshTokens()`.

### `electron/api.js`

- HTTPS client for API Gateway.
- Uses `auth.getIdToken()` or `auth.getAccessToken()` for Bearer auth.
- `saveDailyCompletion(data)`, `getDailyCompletion(date)`, `getLeaderboard(date)`.

### `electron/config.js`

- `cognito`: `region`, `userPoolId`, `clientId`, `domain`.
- `api`: `baseUrl` (API Gateway REST endpoint).

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

## AWS Backend

### Lambda: `lambda/dailyCompletion.mjs`

- **DynamoDB** table: `SudokuDailyCompletions` (or `TABLE_NAME` env).
- **Auth**: User ID from `event.requestContext.authorizer.claims.sub` (Cognito authorizer).
- **PUT**: Store completion (`date`, `difficulty`, `time`, `nickname`, `lives`).
- **GET** `?date=YYYY-MM-DD`: Return user's completion for that date.
- **GET** `?date=YYYY-MM-DD&leaderboard=true`: Return sorted leaderboard for that date.

Deploy via API Gateway + Lambda authorizer (Cognito). Configure `electron/config.js` with the API base URL and Cognito client/domain.

---

## Game Component Pattern

The main game lives in a single React component (e.g. `src/Sudoku.jsx`):

- **State**: `useState` for screens, game data, UI state, `leaderboard`, `dailyCompleted`, `loginLoading`, `loginError`.
- **Effects**: `useEffect` for timers, keyboard listeners, cleanup.
- **Refs**: `useRef` for intervals/timeouts that need cleanup.
- **Styling**: Inline `style={{}}` objects or a shared palette object.
- **Screens**: Conditional render by screen state (e.g. `menu`, `game`, `over`, `win`).
- **Backend**: Uses `window.electronAPI` for login, logout, daily completion save/fetch, leaderboard fetch.

No external UI library; plain React + inline styles.

---

## Build Output

After `npm run electron:build:win`:

```
release/
└── win-unpacked/
    ├── Sudoku.exe
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
| `npm run dist:zip` | Create `release/Sudoku-Windows.zip` (close app first) |

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

1. Add game to Steam as non-Steam game → point to `Sudoku.exe`.
2. Right‑click → Manage → Set custom artwork.
3. Use images from `SteamAssets/` (grid, hero, logo, poster).

Steam does not auto-detect artwork; users add it manually.
