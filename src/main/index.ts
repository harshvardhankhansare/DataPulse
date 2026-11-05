import { app, BrowserWindow, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDuckDB, closeDuckDB } from './duckdb/connection.js';
import { registerIpcHandlers } from './ipc/handlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;

function createSplashWindow() {
  const splashPath = path.join(__dirname, 'splash.html');
  splashWindow = new BrowserWindow({
    width: 500,
    height: 340,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  splashWindow.loadFile(splashPath).catch((err) => {
    console.error('Failed to load splash screen:', err);
  });
}

function createWindow() {
  const indexPath = path.join(__dirname, '../renderer/index.html');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    // ~80% of the work area, clamped to sensible bounds
    width: Math.max(1024, Math.round(screenWidth * 0.8)),
    height: Math.max(720, Math.round(screenHeight * 0.8)),
    minWidth: 1024,
    minHeight: 720,
    center: true,
    show: false, // shown on 'ready-to-show' after splash transition
    title: 'Offline Data Intelligence',
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    // Hold splash screen briefly to show smooth startup progress animation
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
      }
      mainWindow?.show();
      mainWindow?.focus();
    }, 1600);
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] [${level}] ${message} (${sourceId}:${line})`);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Renderer Gone]', details);
  });

  mainWindow.loadFile(indexPath).catch((err) => {
    console.error('Failed to load local HTML file:', err);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    // Display splash screen immediately
    createSplashWindow();

    // Initialize DuckDB
    await initDuckDB();

    // Register IPC handlers
    registerIpcHandlers();

    // Create the application window
    createWindow();


    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    console.error('Failed to initialize app:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  await closeDuckDB();
});
