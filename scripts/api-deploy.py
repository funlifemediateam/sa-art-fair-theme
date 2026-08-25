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
# Live theme by default. Set SAF_THEME_ID to push to an unpublished theme
# instead. The live theme became "SAAF Rebrand V1 (Hanre)" on 2026-08-20;
# the old "Copy of Dawn" 151028203598 is unpublished and no longer a target.
REBRAND_THEME = "152790532174"
REBRAND_BRANCH = "rebrand-v1"
THEME = os.environ.get("SAF_THEME_ID", REBRAND_THEME)
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


def git_autosync(pushed):
    """After a successful deploy, commit any local changes and push to GitHub.

    The theme repo is the source of truth (Shopify draft themes are not used
    for history), and pushes were being forgotten — twice a whole round of
    work sat un-pushed. So every deploy now backs itself up automatically.
    Opt out with SAF_NO_AUTOSYNC=1. Never fails the deploy on a git error.
    """
    if os.environ.get("SAF_NO_AUTOSYNC") == "1":
        return
    try:
        subprocess.run(["git", "add", "-A"], check=True)
        # Nothing staged? then there is nothing to commit or push.
        if subprocess.run(["git", "diff", "--cached", "--quiet"]).returncode == 0:
            print("\nGitHub: working tree clean, nothing to commit.")
            _git_push()
            return
        names = ", ".join(os.path.basename(f) for f in pushed[:4])
        if len(pushed) > 4:
            names += f", +{len(pushed) - 4} more"
        stamp = time.strftime("%Y-%m-%d %H:%M")
        msg = f"auto: deploy {len(pushed)} file(s) ({names}) — {stamp}"
        subprocess.run(["git", "commit", "-m", msg], check=True)
        print(f"\nGitHub: committed — {msg}")
        _git_push()
    except Exception as e:
        print(f"\nGitHub AUTO-SYNC FAILED (deploy is still live): {e}")
        print("  Run `git add -A && git commit -m '…' && git push origin main` manually.")


def _git_push():
    try:
        subprocess.run(["git", "push", "origin", "HEAD"], check=True)
        print("GitHub: pushed to origin ✓")
    except Exception as e:
        print(f"GitHub PUSH FAILED (commit is saved locally): {e}")


def current_branch():
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"], text=True).strip()
    except Exception:
        return ""


def guard_branch():
    """Refuse to push pre-rebrand files over Hanre's live design.

    `main` still holds the old Dawn build; `rebrand-v1` holds the design that is
    now live. Deploying from the wrong branch would silently overwrite the
    rebrand section by section, which is exactly the mistake that is hardest to
    notice and hardest to undo. Override with SAF_FORCE=1 when you really mean
    it (e.g. pushing a hotfix from a detached HEAD).
    """
    if THEME != REBRAND_THEME or os.environ.get("SAF_FORCE") == "1":
        return
    branch = current_branch()
    if branch and branch != REBRAND_BRANCH:
        print(f"REFUSING TO DEPLOY: you are on branch '{branch}', but theme {THEME}")
        print(f"is the live rebrand, built from '{REBRAND_BRANCH}'.")
        print("Pushing from here would overwrite the rebrand with the old design.")
        print(f"  git switch {REBRAND_BRANCH}     # then re-run")
        print("  SAF_FORCE=1 python3 scripts/api-deploy.py ...   # if you really mean it")
        sys.exit(1)


def main():
    guard_branch()
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
    git_autosync(to_push)


if __name__ == "__main__":
    main()
