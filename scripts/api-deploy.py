#!/usr/bin/env python3
"""Deploy theme files via the Shopify Admin Asset API.

The Shopify CLI's `theme push` deleted live section files on this store
(2026-07-09, CLI 3.94.3 AND 4.4.0), so we upload directly instead.
Compares local MD5s against remote asset checksums and PUTs only what
differs or is missing. Never deletes anything remote.

Usage:
  python3 scripts/api-deploy.py              # sync all changed theme files
  python3 scripts/api-deploy.py <file> ...   # push specific files only
"""
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.request

STORE = "b77sng-1n.myshopify.com"
THEME = "151028203598"
TOKEN = os.environ.get("SHOPIFY_ADMIN_TOKEN", "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")
API = f"https://{STORE}/admin/api/2024-10/themes/{THEME}/assets.json"
THEME_DIRS = ("assets/", "config/", "layout/", "locales/", "sections/", "snippets/", "templates/")
# Editor-owned files: the theme editor writes these; never overwrite from local
SETTINGS_FILES = {"config/settings_data.json"}
SETTINGS_PREFIXES = ("templates/", "sections/")  # .json files there hold editor block settings


def req(url, method="GET", payload=None):
    r = urllib.request.Request(url, data=payload, method=method, headers={
        "X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json"})
    with urllib.request.urlopen(r) as resp:
        return json.loads(resp.read())


def local_theme_files():
    out = subprocess.check_output(["git", "ls-files"], text=True)
    return [f for f in out.splitlines() if f.startswith(THEME_DIRS)]


def is_editor_owned(path):
    return path in SETTINGS_FILES or (
        path.startswith(SETTINGS_PREFIXES) and path.endswith(".json"))


def main():
    explicit = sys.argv[1:]
    files = explicit or local_theme_files()

    remote = {a["key"]: a.get("checksum") for a in req(API)["assets"]}
    to_push = []
    for f in files:
        if not os.path.isfile(f):
            print(f"skip (not found): {f}")
            continue
        if not explicit and is_editor_owned(f) and f in remote:
            continue  # editor owns it; only push if named explicitly or missing
        data = open(f, "rb").read()
        if f in remote and remote[f] and hashlib.md5(data).hexdigest() == remote[f]:
            continue
        to_push.append(f)

    if not to_push:
        print("Nothing to push — remote matches local.")
        return

    print(f"Pushing {len(to_push)} file(s):")
    failed = []
    for f in to_push:
        data = open(f, "rb").read()
        try:
            text = data.decode("utf-8")
            body = {"asset": {"key": f, "value": text}}
        except UnicodeDecodeError:
            import base64
            body = {"asset": {"key": f, "attachment": base64.b64encode(data).decode()}}
        try:
            req(API, "PUT", json.dumps(body).encode())
            print(f"  ✓ {f}")
        except Exception as e:
            failed.append(f)
            print(f"  ✗ {f}: {e}")
        time.sleep(0.55)  # stay under the 2 req/s REST limit

    # Verify everything we pushed is actually there
    remote_after = {a["key"] for a in req(API)["assets"]}
    gone = [f for f in to_push if f not in remote_after]
    if gone or failed:
        print("\nDEPLOY INCOMPLETE — fix before walking away:")
        for f in set(gone + failed):
            print(f"  MISSING/FAILED: {f}")
        sys.exit(1)
    print(f"\nDone — {len(to_push)} file(s) live, all verified present.")


if __name__ == "__main__":
    main()
