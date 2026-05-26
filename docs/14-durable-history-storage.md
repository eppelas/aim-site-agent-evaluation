# Durable History Storage

The repo now has a storage contract and a guarded S3-compatible sync adapter. The adapter skips cleanly until external storage credentials are configured.

## Current State

`npm run dashboard` writes:

- `reports/history/index.html` - human-readable history dashboard;
- `reports/history/index.json` - machine-readable run index;
- `reports/latest/storage-manifest.json` - files needed to mirror the current latest run and its archived copy;
- `reports/history/storage-manifest.json` - files needed to mirror all local archived runs.

Each manifest entry includes:

- repo-relative file path;
- artifact kind;
- run ID when the file belongs to a run;
- byte size;
- SHA-256 hash;
- future object-store destination key.

The generator intentionally does not upload files. It only describes what should be uploaded later.

`npm run sync:history` reads a manifest and uploads listed files when the required storage environment variables exist. Without credentials it exits successfully with a skipped summary, so scheduled QA is not blocked before the storage provider is configured.

## Recommended Provider

Default recommendation: Cloudflare R2 or another S3-compatible object store.

Why:

- stable object keys for immutable run history;
- simple CLI/API sync from GitHub Actions;
- cheaper and simpler for screenshots than database storage;
- keeps GitHub Pages as the review UI while large artifacts live elsewhere.

`config/history-storage.json` stores the provider recommendation, base key, retention policy, and future environment variable names.

## Future Secrets

Planned environment variables:

- `QA_HISTORY_S3_ENDPOINT`;
- `QA_HISTORY_S3_BUCKET`;
- `QA_HISTORY_S3_ACCESS_KEY_ID`;
- `QA_HISTORY_S3_SECRET_ACCESS_KEY`;
- `QA_HISTORY_S3_REGION`.

Do not add these secrets until the storage bucket/account has been created.

## Retention Policy

Initial default:

- reports: 24 months;
- screenshots: 12 months;
- visual diffs: 12 months;
- baselines: manual review before pruning.

Run folders should be immutable. If a report needs correction, create a new run rather than editing an old run in storage.

## Sync Adapter

Local dry run:

```bash
npm run sync:history -- --dry-run
```

Upload latest-run manifest when credentials are present:

```bash
npm run sync:history
```

Upload a specific manifest:

```bash
npm run sync:history -- --manifest reports/history/storage-manifest.json
```

The script checks remote object metadata before upload. If the stored `sha256` metadata matches the manifest, the object is counted as unchanged.

## Next Adapter Work

V2 implementation should:

1. Create the actual R2/S3 bucket and add GitHub secrets.
2. Run `site-qa.yml` once and confirm uploaded object count.
3. Add optional public or signed links back into dashboard artifacts if large screenshots should live outside GitHub Pages.
4. Add pruning based on the retention policy after at least one month of real history exists.
