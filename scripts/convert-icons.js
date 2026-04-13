import sharp from 'sharp';
import { readFileSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');
const iconsDir = join(root, 'public', 'icons');
const twaAssets = join(root, 'twa-assets');

mkdirSync(twaAssets, { recursive: true });

const svg512 = readFileSync(join(iconsDir, 'icon-512.svg'));
const svg192 = readFileSync(join(iconsDir, 'icon-192.svg'));

// 512x512 (any)
await sharp(svg512, { density: 300 })
  .resize(512, 512)
  .png()
  .toFile(join(twaAssets, 'icon-512.png'));
console.log('Created: twa-assets/icon-512.png');

// 192x192 (any)
await sharp(svg192, { density: 300 })
  .resize(192, 192)
  .png()
  .toFile(join(twaAssets, 'icon-192.png'));
console.log('Created: twa-assets/icon-192.png');

// 512x512 maskable (same icon, full bleed for maskable)
await sharp(svg512, { density: 300 })
  .resize(512, 512)
  .png()
  .toFile(join(twaAssets, 'icon-maskable-512.png'));
console.log('Created: twa-assets/icon-maskable-512.png');

// Copy to public/icons/ for Cloud Run
copyFileSync(join(twaAssets, 'icon-512.png'), join(iconsDir, 'icon-512.png'));
copyFileSync(join(twaAssets, 'icon-192.png'), join(iconsDir, 'icon-192.png'));
copyFileSync(join(twaAssets, 'icon-maskable-512.png'), join(iconsDir, 'icon-maskable-512.png'));
console.log('Copied PNGs to public/icons/');

console.log('Done!');
