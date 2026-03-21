/**
 * Regenerates apple-touch-icon from source with full-bleed, no padding.
 * iOS applies its own rounded corners — the source must fill the entire canvas
 * with a solid background so no black edges appear on the home screen.
 *
 * Usage: node scripts/regen-apple-icon.mjs
 */
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const LIGHT_SOURCE = 'c:/Kanteen ASET/icon.iOS.png';
const DARK_SOURCE  = 'c:/Kanteen ASET/DarkTheme-icon.iOS.png';

await sharp(LIGHT_SOURCE)
  .resize(180, 180, { fit: 'cover', position: 'centre' })
  .flatten({ background: { r: 255, g: 242, b: 229 } }) // #FFF2E5
  .png()
  .toFile(path.join(ROOT, 'public/apple-touch-icon.png'));
console.log('✓ apple-touch-icon.png');

await sharp(DARK_SOURCE)
  .resize(180, 180, { fit: 'cover', position: 'centre' })
  .flatten({ background: { r: 30, g: 30, b: 30 } }) // #1e1e1e
  .png()
  .toFile(path.join(ROOT, 'public/apple-touch-icon-dark.png'));
console.log('✓ apple-touch-icon-dark.png');
