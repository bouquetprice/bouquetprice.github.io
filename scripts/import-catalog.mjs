// Builds the app's built-in catalog from the florist's price list.
//
//   npm run catalog
//     data/price-list.tsv (+ pictures named in data/photo-prompts.xlsx) → src/data/catalog.json
//
// data/price-list.tsv is the Google Sheet "Bouquet Calculator Prices" downloaded as TSV
// (File → Download → Tab-separated values), with the columns
//   Hebrew, Russian, English, Price, Bought as ("stem" or "bunch <stems>").
// Rows without a price are section titles: "Flowers", "Roses", "Greenery" (greenery
// items get the greenery multiplier, the rest the flower one). " (?)" — a plant still
// to be confirmed — is dropped from names.
//
// Item IDs are kept in data/catalog-ids.json (Hebrew name → ID), so an item keeps its ID
// (and the florist's own prices for it) when names are edited; new rows get an ID from
// their English name. data/spoken-names.json adds other names people say out loud
// (ID → names), e.g. the old catalog's names, so dictation keeps understanding them.
// Each item gets the picture its row names in data/photo-prompts.xlsx (by sheet row),
// if that picture is in public/photos/ (npm run photos:app).
// Note: the built catalog is public (it ships in the app and in the repository).

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readSheet } from 'read-excel-file/node';

const INPUT = 'data/price-list.tsv';
const IDS = 'data/catalog-ids.json';
const SPOKEN = 'data/spoken-names.json';
const OUTPUT = 'src/data/catalog.json';
const PROMPTS = 'data/photo-prompts.xlsx';

/**
 * Plain items for dictation ("five roses" without a length): priced at the average of a group.
 * Their group is every item whose Hebrew name matches `members`.
 */
const AVERAGED = [
  {
    before: 'ורד 50 ס"מ',
    item: { id: 'rose', category: 'flower', names: { he: 'ורד', ru: 'Роза', en: 'Rose' } },
    picture: 'rose',
    members: /^ורד \d+ ס"מ$/,
  },
  {
    before: 'ורד ספרי 50 ס"מ',
    item: { id: 'spray-rose', category: 'flower', names: { he: 'ורד ספרי', ru: 'Роза кустовая', en: 'Spray rose' } },
    picture: 'rose-spray',
    members: /^ורד ספרי \d+ ס"מ$/,
  },
];

const read = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback);
const idsByHebrew = read(IDS, {});
const spokenNames = read(SPOKEN, {});

const clean = (value) => (value ?? '').replace(/\s*\(\?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
const slug = (value) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/['’"«»]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

// Sheet row number → picture name.
const pictureOfRow = new Map();
if (existsSync(PROMPTS)) {
  const sheet = await readSheet(PROMPTS, 'Photos');
  const titles = sheet[0].map((title) => String(title ?? '').toLowerCase());
  const rowAt = titles.indexOf('row');
  const imageAt = titles.indexOf('image');
  for (const line of sheet.slice(1)) if (line[rowAt] && line[imageAt]) pictureOfRow.set(Number(line[rowAt]), String(line[imageAt]));
}
// The picture's address carries a fingerprint of its content: phones keep pictures once seen
// (service worker, cache-first), so a replaced picture needs a new address to be fetched again.
const photo = (picture) => {
  const file = `public/photos/${picture}.webp`;
  if (!picture || !existsSync(file)) return undefined;
  const version = createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 8);
  return `photos/${picture}.webp?v=${version}`;
};

const rows = readFileSync(INPUT, 'utf8')
  .split('\n')
  .map((line, index) => Object.assign(line.split('\t').map((cell) => cell.trim()), { sheetRow: index + 1 }))
  .filter((cells) => cells.some(Boolean));
const header = rows[0].map((title) => title.toLowerCase());
const col = (name) => {
  const index = header.findIndex((title) => title.startsWith(name));
  if (index < 0) throw new Error(`Missing column "${name}" in ${INPUT}`);
  return index;
};
const [heCol, ruCol, enCol, priceCol, boughtCol] = ['hebrew', 'russian', 'english', 'price', 'bought'].map(col);

const usedIds = new Set(Object.values(idsByHebrew));
const builtIds = new Set();
const items = [];
let category = 'flower';

for (const row of rows.slice(1)) {
  const price = Number((row[priceCol] ?? '').replace(',', '.'));
  if (!row[priceCol]) {
    // A section title.
    category = /greenery|зелень|ירק/i.test(row.join(' ')) ? 'greenery' : 'flower';
    continue;
  }
  const names = {};
  for (const [language, index] of [['he', heCol], ['ru', ruCol], ['en', enCol]]) {
    const name = clean(row[index]);
    if (name) names[language] = name;
  }

  // Two rows may share a Hebrew name (e.g. פמפס, the flower and the leaves): tell them apart by English.
  const idKey = builtIds.has(idsByHebrew[names.he]) ? `${names.he} | ${names.en ?? names.ru}` : names.he;
  let id = idsByHebrew[idKey];
  if (!id) {
    const base = slug(names.en ?? names.ru ?? names.he);
    id = base;
    for (let n = 2; usedIds.has(id); n++) id = `${base}-${n}`;
    usedIds.add(id);
    idsByHebrew[idKey] = id;
  }
  builtIds.add(id);

  const averaged = AVERAGED.find((entry) => entry.before === names.he);
  if (averaged) {
    const plain = { ...averaged.item, aliases: [], boughtAs: 'stem', priceRule: { averageOfGroup: averaged.item.id } };
    if (photo(averaged.picture)) plain.photo = photo(averaged.picture);
    items.push(plain);
  }

  const bunch = /bunch\s*(\d+)/i.exec(row[boughtCol] ?? '');
  const item = { id, category, names, aliases: [], boughtAs: bunch ? 'bunch' : 'stem' };
  const group = AVERAGED.find((entry) => entry.members.test(names.he));
  if (group) item.group = group.item.id;
  if (bunch) item.stemsPerBunch = Number(bunch[1]);
  item.purchasePrice = price;
  if (photo(pictureOfRow.get(row.sheetRow))) item.photo = photo(pictureOfRow.get(row.sheetRow));
  items.push(item);
}

// Other spoken names, without repeating the item's own names.
for (const item of items) {
  const own = new Set(Object.values(item.names).map((name) => name.toLowerCase()));
  item.aliases = [...new Set(spokenNames[item.id] ?? [])].filter((name) => !own.has(name.toLowerCase()));
}

writeFileSync(OUTPUT, `${JSON.stringify(items, null, 2)}\n`);
writeFileSync(IDS, `${JSON.stringify(idsByHebrew, null, 2)}\n`);
const listed = items.filter((item) => !item.priceRule).length;
const withPhoto = items.filter((item) => item.photo).length;
console.log(`${listed} items from ${INPUT} + ${items.length - listed} averaged for dictation → ${OUTPUT}; ${withPhoto} with a picture.`);
