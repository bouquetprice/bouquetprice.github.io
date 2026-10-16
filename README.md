# Bouquet Calculator

A Progressive Web App for florists: dictate a bouquet, get its sale price.
See [SPEC.md](SPEC.md) for requirements and decisions.

Current stage: **core app** (roadmap step 3): calculator with on-device Whisper, catalog, price table, settings.

## Development

```bash
npm install
npm run dev        # dev server
npm run build      # type-check and production build (includes the service worker)
npm run preview    # serve the production build on http://localhost:4173
npm run icons      # regenerate PNG icons from public/favicon.svg
npm test           # unit tests (phrase parsing, pricing)
npm run photos     # generate missing catalog pictures (OpenAI; key in .env.local)
npm run photos:app # shrink generated pictures into public/photos/
npm run catalog    # rebuild src/data/catalog.json from data/price-list.tsv
```

## Data

- `data/price-list.tsv` — the built-in catalog with **default prices**: the Google Sheet
  "Bouquet Calculator Prices" downloaded as TSV (Hebrew, Russian, English, Price, Bought as;
  section rows Flowers / Roses / Greenery). Replace it and run `npm run catalog`; the result,
  `src/data/catalog.json`, is public.
- `data/catalog-ids.json` — keeps each item's ID stable (Hebrew name → ID);
  `data/spoken-names.json` — extra names people say out loud, per item ID.
- `data/photo-prompts.xlsx` — the picture for every price-list row and what to draw;
  `generated-photos/` (git-ignored) holds the generated originals.
- `private/` — invoices and working copies, git-ignored.

## Publishing

The app is published on GitHub Pages: **https://bouquetprice.github.io/**
(repository `bouquetprice/bouquetprice.github.io`, organization owned by the author's account)

Every push to `main` runs `.github/workflows/deploy.yml`: tests, build (at the site
root for a `<owner>.github.io` repository, otherwise under `/<repository>/`), deploy. Installed apps then show
"A new version is ready" and update when the florist taps it.

## Testing a build on a phone before publishing

Microphone access requires HTTPS. For a quick check of unpublished changes,
serve the build and open a temporary tunnel (free, no account; the link changes
every time and app data is stored per address):

```bash
npm run build && npm run preview -- --port 4173
cloudflared tunnel --url http://localhost:4173
```

## Project layout

- `src/model/` — data model, pricing rules, phrase parsing (`parseBouquet.ts`), sound-alike matching, Excel.
- `src/store/` — on-device storage (IndexedDB), photos, backup.
- `src/speech/` — Whisper (on-device recognition) worker and client, audio recording, hints.
- `src/screens/` — Calculator, Catalog, Prices (+ item editor), Settings (+ speech diagnostics).
- `src/i18n/` — UI translations (English, Hebrew, Russian). Add a language by adding a file.
- `src/platform.ts`, `src/pwaUpdate.ts` — install hints, update prompt.
