#!/usr/bin/env bash
# Set API service variables to use a Railway Bucket for asset storage (S3-compatible).
# Requires: Railway CLI installed and logged in; project linked (e.g. cd scholaracle && railway link).
# Create the bucket first in the dashboard: railway open → Create → Bucket, then note its service name.
#
# Usage:
#   BUCKET_SERVICE_NAME=bucket ./scripts/railway-asset-bucket.sh
#   ./scripts/railway-asset-bucket.sh assets   # use service named "assets"
#
# Bucket service name defaults to "bucket" if not set.

set -e
BUCKET="${BUCKET_SERVICE_NAME:-${1:-bucket}}"
SERVICE="${RAILWAY_SERVICE:-api}"

echo "Setting asset store variables on service \"$SERVICE\" to use Railway Bucket \"$BUCKET\"."
echo "References use Railway syntax: \${{$BUCKET.VAR}}"
echo ""

railway variables \
  --service "$SERVICE" \
  --set "ASSET_STORE=s3" \
  --set "AWS_ACCESS_KEY_ID=\${{$BUCKET.ACCESS_KEY_ID}}" \
  --set "AWS_SECRET_ACCESS_KEY=\${{$BUCKET.SECRET_ACCESS_KEY}}" \
  --set "AWS_REGION=\${{$BUCKET.REGION}}" \
  --set "AWS_S3_BUCKET=\${{$BUCKET.BUCKET}}" \
  --set "AWS_S3_ENDPOINT=\${{$BUCKET.ENDPOINT}}"

echo ""
echo "Done. Redeploy the API for changes to take effect: railway up --service $SERVICE"
