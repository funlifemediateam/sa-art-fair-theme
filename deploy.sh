#!/bin/bash
# ─────────────────────────────────────────────────────────────
# SA Art Fair — safe deploy script
#
# Pulls the latest editor settings (images, text, etc.) from
# Shopify FIRST, then pushes your code changes.
# This prevents editor-configured images from being wiped.
#
# Usage: ./deploy.sh
# ─────────────────────────────────────────────────────────────

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
echo "→ Pushing code changes..."
shopify theme push \
  --store "$STORE" \
  --theme "$THEME" \
  --allow-live \
  --only "sections/*.liquid" \
  --only "sections/*.json" \
  --only "templates/*.json" \
  --only "templates/*.liquid" \
  --only "config/settings_data.json" \
  --only "layout/*.liquid" \
  --only "assets/*" \
  --only "snippets/*.liquid" \
  --only "locales/*.json"

echo ""
echo "✓ Done."
