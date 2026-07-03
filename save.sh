#!/bin/bash
cd "$(dirname "$0")"

echo ""
echo "What did you change? (e.g. 'added team page', 'fixed header logo')"
read -r description

if [ -z "$description" ]; then
  description="manual save $(date '+%Y-%m-%d %H:%M')"
fi

git add -A
git commit -m "$description"
git push origin main

echo ""
echo "✓ Saved! Your version is backed up on GitHub."
echo ""
