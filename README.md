# Court Coverage Atlas

A shareable, read-only county and court coverage application built with Rust
and Axum.

Live site: `http://hamzasurti.com/court-coverage-atlas/`

The GitHub account's existing `hamzasurti.com` Pages domain currently has an
invalid HTTPS certificate. The atlas deploy is healthy over HTTP; HTTPS depends
on repairing that account-level custom-domain certificate.

## Data model

- 3,235 Census counties and county equivalents, January 1, 2025 vintage.
- 7,115 court records from `Coverage map - all_courts.csv`.
- Tyler market access and deployment data from `Integrator_Markets_5-20.xlsx`.
- Product and certification posture from the local Tyler API dossier.

County matching is source-aware. Records with explicit county names are linked
directly. Courts identified only by a circuit, district, city, or venue remain
in the complete court index and in state-level unresolved counts.

## Build the data

The checked-in `static/data/coverage.json` is ready to serve. To regenerate it
after changing either source file:

```bash
python3 scripts/build_data.py
```

The script requires `openpyxl`.

## Run

```bash
cargo run --release
```

Open `http://localhost:3000`.

Set a different port with `PORT=8080`.

## Deploy

The release binary embeds the UI and data assets. Deploy the binary directly
or use the included Dockerfile.

```bash
docker build -t court-coverage-atlas .
docker run --rm -p 3000:3000 court-coverage-atlas
```

The public GitHub Pages deployment serves `static/` directly through
`.github/workflows/deploy-pages.yml`.
