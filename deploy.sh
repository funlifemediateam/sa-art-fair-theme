#!/bin/bash
# ─────────────────────────────────────────────────────────────
# SA Art Fair — safe deploy script
#
# Pulls the latest editor settings (images, text, etc.) from
# Shopify FIRST, then pushes code changes via the Admin Asset
# API (scripts/api-deploy.py).
#
# DO NOT use `shopify theme push` on this store: on 2026-07-09
# it deleted live section files (reproduced on CLI 3.94.3 and
# 4.4.0) while reporting success. The API script never deletes.
#
# Usage: ./deploy.sh
# ─────────────────────────────────────────────────────────────
set -e
cd "$(dirname "$0")"

STORE="b77sng-1n.myshopify.com"
THEME="151028203598"

echo "→ Syncing editor settings from Shopify..."
shopify theme pull \
  --store "$STORE" \
  --theme "$THEME" \
  --nodelete \
  --only "templates/*.json" \
  --only "sections/*.json" \
  --only "config/settings_data.json"

echo ""
echo "→ Pushing code changes via Admin API..."
python3 scripts/api-deploy.py

echo ""
echo "✓ Done."
