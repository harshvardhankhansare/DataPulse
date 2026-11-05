import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const src = path.resolve(__dirname, '../src/main/splash.html');
const destDir = path.resolve(__dirname, '../dist/main');
const dest = path.join(destDir, 'splash.html');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

fs.copyFileSync(src, dest);
console.log('[Build] Copied splash.html to dist/main/splash.html');
