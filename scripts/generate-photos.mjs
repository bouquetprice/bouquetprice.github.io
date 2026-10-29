// Generates catalog pictures with the OpenAI Images API from data/photo-prompts.xlsx.
// All pictures share one look: framed close on a pure white background, soft studio light.
//
//   npm run photos -- --limit 5            try 5 new pictures first
//   npm run photos                         everything not generated yet
//   npm run photos -- --only rose,tulip    just these pictures (Image column)
//   npm run photos -- --force --only rose  generate again, replacing the old file
//   npm run photos -- --dry-run            show the prompts, call nothing, cost nothing
//   other options: --model <id> (default gpt-image-2.5-flare), --quality low|medium|high (default medium)
//
// The API key is read from OPENAI_API_KEY or from a ".env.local" file in the project root
// (one line: OPENAI_API_KEY=sk-...). That file is git-ignored; the key is never printed.
// Pictures go to generated-photos/<image>.jpg (git-ignored) with an index.json describing them.
// Rows with Status other than "ok" are skipped, and existing pictures are kept unless --force.

import { readSheet } from 'read-excel-file/node';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const PROMPTS = 'data/photo-prompts.xlsx';
const OUT_DIR = 'generated-photos';
const INDEX = `${OUT_DIR}/index.json`;
const PARALLEL = 2;

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? fallback : args[at + 1];
};
const flag = (name) => args.includes(`--${name}`);

const limit = Number(option('limit', Infinity));
const only = option('only', '')
  .split(',')
  .map((key) => key.trim())
  .filter(Boolean);
const model = option('model', 'gpt-image-2.5-flare');
const quality = option('quality', 'medium');
const force = flag('force');
const dryRun = flag('dry-run');

// Framed close: in the app the pictures are small tiles and round thumbnails, so the
// flower (or leaf) must fill most of the frame, with only a short piece of stem.
// Realism first: generated flowers tend to come out idealised (perfect symmetry, far more
// flowers per stem than the plant has), which florists notice at once.
const prompt = (subject) =>
  `Realistic studio photograph of a real cut stem as sold at a flower market, for a florist's catalogue: ${subject}. ` +
  'Natural and imperfect: slightly asymmetrical, a realistic, modest number of flowers and buds for this plant, ' +
  'flowers at different stages of opening, nothing idealised or perfectly symmetrical, nothing added; leaves only where the description has them. ' +
  'Framed close: the plant fills most of the square frame, with only a short piece of stem at the bottom. ' +
  'Pure white seamless background, soft even diffused daylight, a very faint natural shadow, true-to-life colours, ' +
  'sharp focus. No vase, no wrapping, no hands, no text, no watermark.';

function apiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY.trim();
  if (existsSync('.env.local')) {
    const line = readFileSync('.env.local', 'utf8')
      .split('\n')
      .find((entry) => entry.trim().startsWith('OPENAI_API_KEY='));
    if (line) return line.slice(line.indexOf('=') + 1).trim();
  }
  return null;
}

// One picture per Image key; rows sharing a key share the picture.
const rows = await readSheet(PROMPTS, 'Photos');
const header = rows[0].map((title) => String(title ?? '').trim().toLowerCase());
const col = (name) => {
  const index = header.findIndex((title) => title.startsWith(name));
  if (index < 0) throw new Error(`Missing column "${name}" in ${PROMPTS}`);
  return index;
};
const [rowCol, hebrewCol, imageCol, subjectCol, statusCol] = ['row', 'hebrew', 'image', 'what to draw', 'status'].map(col);
const pictures = new Map();
for (const row of rows.slice(1)) {
  const key = String(row[imageCol] ?? '').trim();
  if (!key) continue;
  const picture = pictures.get(key) ?? { key, subject: '', ok: true, rows: [], names: [] };
  picture.subject ||= String(row[subjectCol] ?? '').trim();
  picture.ok &&= String(row[statusCol] ?? '').trim().toLowerCase() === 'ok';
  picture.rows.push(row[rowCol]);
  picture.names.push(String(row[hebrewCol] ?? '').trim());
  pictures.set(key, picture);
}

const todo = [...pictures.values()]
  .filter((picture) => !only.length || only.includes(picture.key))
  .filter((picture) => picture.ok && picture.subject)
  .filter((picture) => force || !existsSync(`${OUT_DIR}/${picture.key}.jpg`))
  .slice(0, limit);
const waiting = [...pictures.values()].filter((picture) => !picture.ok).map((picture) => picture.key);
console.log(`${pictures.size} pictures in ${PROMPTS}; ${todo.length} to generate now.`);
if (waiting.length) console.log(`Skipped until Status is "ok": ${waiting.join(', ')}`);

if (dryRun) {
  for (const picture of todo) console.log(`\n${picture.key}  (${picture.names.join(', ')})\n  ${prompt(picture.subject)}`);
  process.exit(0);
}
if (!todo.length) process.exit(0);

const key = apiKey();
if (!key) {
  console.error('No OpenAI API key: put OPENAI_API_KEY=sk-... into a .env.local file in the project folder.');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
const index = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, 'utf8')) : {};

async function generate(picture) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: prompt(picture.subject),
        size: '1024x1024',
        quality,
        background: 'opaque',
        output_format: 'jpeg',
        output_compression: 90,
        n: 1,
      }),
    });
    if (response.ok) {
      const result = await response.json();
      return Buffer.from(result.data[0].b64_json, 'base64');
    }
    const message = (await response.text()).slice(0, 300);
    // Rate limits and server hiccups are worth a retry; anything else is reported and skipped.
    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 5000 * attempt));
      continue;
    }
    throw new Error(`HTTP ${response.status}: ${message}`);
  }
}

let done = 0;
const failed = [];
const queue = [...todo];
async function worker() {
  for (let picture = queue.shift(); picture; picture = queue.shift()) {
    try {
      writeFileSync(`${OUT_DIR}/${picture.key}.jpg`, await generate(picture));
      index[picture.key] = {
        rows: picture.rows,
        hebrew: picture.names,
        prompt: prompt(picture.subject),
        model,
        quality,
        createdAt: new Date().toISOString(),
      };
      writeFileSync(INDEX, `${JSON.stringify(index, null, 2)}\n`);
      console.log(`✓ ${++done}/${todo.length} ${picture.key}`);
    } catch (error) {
      failed.push(picture.key);
      console.log(`✗ ${picture.key}: ${error.message}`);
    }
  }
}
await Promise.all(Array.from({ length: PARALLEL }, worker));
console.log(`\nDone: ${done} new pictures in ${OUT_DIR}/.${failed.length ? ` Failed: ${failed.join(', ')}` : ''}`);
