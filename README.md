# Sudoku

A classic Sudoku puzzle game built with React and Electron. Runs as a standalone desktop application—perfect for adding to Steam as a custom/non-Steam game.

## Quick Start

### Development (web)
```bash
npm install
npm run dev
```
Opens at http://localhost:5173

### Development (Electron desktop)
```bash
npm install
npm run electron:dev
```

### Build for Steam / Standalone
```bash
npm install
npm run electron:build:win
```
The portable executable will be in `release/Sudoku-Portable.exe`.

## Adding to Steam

1. Build the game: `npm run electron:build:win`
2. Open Steam → **Games** → **Add a Non-Steam Game to My Library**
3. Click **Browse** and navigate to `release/Sudoku-Portable.exe`
4. Select it and click **Add Selected Programs**
5. Right‑click the game in your library → **Properties** to set a custom name or artwork

## Controls

- **Click** a cell, then press **1–9** to fill
- **N** — toggle note mode
- **Arrow keys** — navigate cells
- **Backspace/Delete** — erase

## Difficulty

- **Easy** — 45 clues
- **Medium** — 35 clues  
- **Hard** — 25 clues
