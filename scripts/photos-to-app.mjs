// Puts the generated pictures into the app.
//
//   npm run photos:app      (then npm run catalog, which links items to these pictures)
//
// Every generated-photos/<picture>.jpg becomes a small WebP in public/photos/<picture>.webp.
// Pictures no longer generated are removed from public/photos/. They are AI-generated
// illustrations (see SPEC §10a); the florist's own photo still wins over them in the app.

import sharp from 'sharp';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';

const SOURCE = 'generated-photos';
const OUT_DIR = 'public/photos';
/** Big enough for the catalog card on a phone screen, small enough to load fast. */
const SIZE = 640;

if (!existsSync(SOURCE)) {
  console.error(`No ${SOURCE}/ folder: generate pictures first (npm run photos).`);
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });
const pictures = readdirSync(SOURCE)
  .filter((file) => file.endsWith('.jpg') && !file.startsWith('trial'))
  .map((file) => file.slice(0, -'.jpg'.length));

for (const picture of pictures) {
  await sharp(`${SOURCE}/${picture}.jpg`)
    .resize(SIZE, SIZE, { fit: 'cover' })
    .webp({ quality: 80 })
    .toFile(`${OUT_DIR}/${picture}.webp`);
}
const removed = readdirSync(OUT_DIR).filter((file) => file.endsWith('.webp') && !pictures.includes(file.slice(0, -5)));
for (const file of removed) rmSync(`${OUT_DIR}/${file}`);
console.log(`${pictures.length} pictures in ${OUT_DIR}/${removed.length ? `; removed ${removed.length} old ones` : ''}.`);
