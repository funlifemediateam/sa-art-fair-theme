#!/usr/bin/env python3
"""Push the rebrand build to the unpublished rebrand theme.

Why a second script instead of api-deploy.py: Shopify only renders section
groups from the exact filenames sections/header-group.json and
sections/footer-group.json. The repo has to keep the LIVE theme's versions of
those intact, so the rebrand copies live under rb-*-group.json here and get
renamed on the way up. Same for templates/index.json.

Order matters: section .liquid files carry the schema Shopify validates the
template JSON against, and unknown setting keys are silently dropped at write
time. So liquid goes first, then a pause, then the JSON.

Usage:
  python3 scripts/rebrand-deploy.py            # push everything
  python3 scripts/rebrand-deploy.py <file>...  # push specific repo paths
"""
import base64
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

STORE = "b77sng-1n.myshopify.com"
THEME = os.environ.get("SAF_THEME_ID", "152790532174")  # SAAF Rebrand V1 (draft)
TOKEN = os.environ.get("SHOPIFY_ADMIN_TOKEN", "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")
API = f"https://{STORE}/admin/api/2024-10/themes/{THEME}/assets.json"

# repo path -> remote asset key (identity unless renamed)
RENAMES = {
    "sections/rb-header-group.json": "sections/header-group.json",
    "sections/rb-footer-group.json": "sections/footer-group.json",
    "templates/rb-index.json": "templates/index.json",
}

BINARY_EXT = (".png", ".jpg", ".jpeg", ".gif", ".woff", ".woff2", ".ttf", ".otf", ".ico", ".webp")


def req(url, method="GET", payload=None, tries=5):
    for attempt in range(tries):
        try:
            r = urllib.request.Request(url, data=payload, method=method, headers={
                "X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json"})
            with urllib.request.urlopen(r, timeout=90) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < tries - 1:
                time.sleep(2 * (attempt + 1))
                continue
            sys.stderr.write(e.read().decode("utf-8", "replace")[:400] + "\n")
            raise


def tracked():
    out = subprocess.check_output(["git", "ls-files"], text=True).splitlines()
    keep = []
    for f in out:
        if f in RENAMES:
            keep.append(f)
        elif f.startswith(("sections/rb-", "snippets/rb-")):
            keep.append(f)
        elif f.startswith("assets/saf-"):
            keep.append(f)
        elif f in ("layout/theme.liquid", "assets/custom.css"):
            keep.append(f)
    return keep


def remote_checksums():
    return {a["key"]: a.get("checksum") for a in req(API)["assets"]}


def push(path):
    key = RENAMES.get(path, path)
    if path.endswith(BINARY_EXT):
        with open(path, "rb") as f:
            asset = {"key": key, "attachment": base64.b64encode(f.read()).decode()}
    else:
        with open(path, encoding="utf-8") as f:
            asset = {"key": key, "value": f.read()}
    req(API, "PUT", json.dumps({"asset": asset}).encode())
    return key


def main():
    explicit = sys.argv[1:]
    files = explicit or tracked()
    missing = [f for f in files if not os.path.exists(f)]
    if missing:
        sys.exit(f"not found: {missing}")

    remote = remote_checksums()
    todo = []
    for f in files:
        key = RENAMES.get(f, f)
        with open(f, "rb") as fh:
            digest = hashlib.md5(fh.read()).hexdigest()
        if remote.get(key) != digest:
            todo.append(f)

    if not todo:
        print("nothing to push — draft theme already matches")
        return

    liquid = [f for f in todo if not f.endswith(".json")]
    jsons = [f for f in todo if f.endswith(".json")]

    print(f"pushing {len(todo)} file(s) to theme {THEME}")
    for f in liquid:
        print("  ", push(f))
        time.sleep(0.55)

    if jsons and liquid:
        # let the new schemas propagate before Shopify validates templates
        print("  … waiting 8s for schema propagation")
        time.sleep(8)

    for f in jsons:
        print("  ", push(f))
        time.sleep(0.55)

    # verify everything landed
    time.sleep(2)
    after = remote_checksums()
    bad = [RENAMES.get(f, f) for f in todo if RENAMES.get(f, f) not in after]
    if bad:
        sys.exit(f"MISSING after push: {bad}")
    print(f"verified {len(todo)} file(s) present on theme {THEME}")


if __name__ == "__main__":
    main()
