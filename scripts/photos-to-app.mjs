// Puts reviewed generated pictures into the app as the catalog's built-in pictures.
//
//   npm run photos:app
//
// For every catalog item listed in CATALOG_PICTURES below, takes generated-photos/<picture>.jpg,
// shrinks it to a small WebP in public/photos/ and records it in src/data/photos.json
// (catalog item ID → picture path). The florist's own photo still wins over these in the app.
// Pictures are AI-generated illustrations (see SPEC §10a).

import sharp from 'sharp';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

/**
 * Catalog item ID → picture name (the Image column of data/photo-prompts.xlsx).
 * For now the current catalog's IDs, mapped by hand; it will come from the price list
 * once the catalog is rebuilt from it.
 */
const CATALOG_PICTURES = {
  rose: 'rose',
  hydrangea: 'hydrangea',
  gypsophila: 'gypsophila',
  'eucalyptus-cinerea': 'eucalyptus-silver-dollar',
  monstera: 'monstera-leaf',
};

/** Big enough for the catalog card on a phone screen, small enough to load fast. */
const SIZE = 640;
const OUT_DIR = 'public/photos';
const MAP = 'src/data/photos.json';

mkdirSync(OUT_DIR, { recursive: true });
const photos = {};
const missing = [];
for (const [itemId, picture] of Object.entries(CATALOG_PICTURES)) {
  const source = `generated-photos/${picture}.jpg`;
  if (!existsSync(source)) {
    missing.push(picture);
    continue;
  }
  await sharp(source).resize(SIZE, SIZE, { fit: 'cover' }).webp({ quality: 80 }).toFile(`${OUT_DIR}/${picture}.webp`);
  photos[itemId] = `photos/${picture}.webp`;
}
writeFileSync(MAP, `${JSON.stringify(photos, null, 2)}\n`);
console.log(`${Object.keys(photos).length} pictures in the app (${MAP}).`);
if (missing.length) console.log(`Not generated yet: ${missing.join(', ')}`);
