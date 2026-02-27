# Asset storage backend

## What’s in place

- **Metadata**: MongoDB `slc_assets` (AssetRepository).
- **Blob store**: `IAssetStore` — `LocalAssetStore` (filesystem) or `S3AssetStore` (Railway Buckets, R2, B2).
- **API**: Upload (connector auth), GET/HEAD by asset ID (connector **or** user JWT), prune (connector only).

## Upload vs download by reference

- **Original URL (school)** → Scraper **downloads** from school, then **uploads** to our API. Ops are rewritten so `record.url` becomes the **server URL**.
- **Server URL** (`https://api…/api/assets/:assetId`) → **Download** from our API: use GET (or HEAD) with either **connector JWT** (scraper) or **user JWT** (web app). Response streams the file from the configured store (S3 or local).

## What’s left for a “proper” backend

1. **Choose a production blob store** and wire it via `IAssetStore`.
2. **Configure it** (env or Railway variable references).
3. **Optional**: Use signed URLs for download so the API doesn’t stream bytes (saves API egress).

---

## Inexpensive storage options

### Railway (you’re already here)

| Option | What it is | Cost | Best for |
|--------|------------|------|----------|
| **Railway Buckets** | S3-compatible object storage | **$0.015/GB-month**, free egress, free unlimited API ops | Production assets; multi-replica; same bill as Railway |
| **Railway Volumes** | Persistent disk attached to a service | Billed with the service; backup options | Single-replica, keep using `LocalAssetStore` |

**Recommendation on Railway:** Use **Railway Buckets**. Add a Bucket in the project, reference its credentials in the API service (Variable References), set `ASSET_STORE=s3` and the bucket env vars. The API already supports an S3-backed `IAssetStore` (see below).

### If you prefer external S3-compatible

- **Cloudflare R2** — Free egress, ~$0.015/GB; free tier 10GB. Use with `ASSET_STORE=s3` and R2 endpoint/keys.
- **Backblaze B2** — Very cheap storage; free egress to Cloudflare. S3-compatible API.

---

## Configuration

| Env | Description |
|-----|-------------|
| `ASSET_STORAGE_PATH` | For local store: directory path (default `./data/assets`). On Railway Volume, set to `RAILWAY_VOLUME_MOUNT_PATH` or e.g. `$RAILWAY_VOLUME_MOUNT_PATH/assets`. |
| `ASSET_STORE` | `local` (default) or `s3`. |
| S3 (when `ASSET_STORE=s3`) | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET` (required); `AWS_S3_ENDPOINT` (optional, e.g. `https://storage.railway.app` for Railway Buckets). |

**Railway Buckets (CLI):**

1. Create the bucket in the dashboard (CLI cannot create buckets): `railway open` → Create → Bucket, choose region, note the bucket’s **service name** (e.g. `bucket` or `assets`).
2. From the repo root (with project linked): run the script to set API variables to reference the bucket:
   ```bash
   cd scholaracle
   railway link   # if not already linked
   ./scripts/railway-asset-bucket.sh bucket   # use your bucket’s service name
   # or: BUCKET_SERVICE_NAME=assets ./scripts/railway-asset-bucket.sh
   ```
3. Redeploy the API: `railway up --service api`.

**Railway Buckets (dashboard):** In the API service, add Variable References from the Bucket (preset or manual): `AWS_ACCESS_KEY_ID` ← `ACCESS_KEY_ID`, etc., and set `ASSET_STORE=s3`.

---

## Summary

- **Right now:** Local filesystem (`LocalAssetStore`) + MongoDB. Fine for single-node and dev.
- **Proper backend:** Use **Railway Buckets** (or R2/B2) via the S3-backed store; set `ASSET_STORE=s3` and the listed env vars. No code change beyond config.
