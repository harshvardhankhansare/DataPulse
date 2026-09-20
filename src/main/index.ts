import { app, BrowserWindow, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDuckDB, closeDuckDB } from './duckdb/connection.js';
import { registerIpcHandlers } from './ipc/handlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const indexPath = path.join(__dirname, '../renderer/index.html');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  console.log(`Primary display size: ${screenWidth}x${screenHeight}`);

  mainWindow = new BrowserWindow({
    width: 1024,
    height: 720,
    center: true,
    show: true,
    title: 'Offline Data Intelligence',
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] [${level}] ${message} (${sourceId}:${line})`);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Renderer Gone]', details);
  });

  mainWindow.loadFile(indexPath).then(() => {
    console.log('Renderer HTML loaded successfully');
    console.log('Window bounds:', mainWindow?.getBounds());
    console.log('Window isVisible:', mainWindow?.isVisible());
    if (mainWindow) {
      mainWindow.restore();
      mainWindow.show();
      mainWindow.setAlwaysOnTop(true);
      mainWindow.focus();
      app.focus({ steal: true });
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.setAlwaysOnTop(false);
        }
      }, 1500);
    }
  }).catch((err) => {
    console.error('Failed to load local HTML file:', err);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
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
