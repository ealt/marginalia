#!/usr/bin/env bash
set -euo pipefail

print_usage() {
  cat <<'USAGE'
Usage: scripts/install-marginalia.sh [options] [vault_dir]

Installs the latest Marginalia release into an Obsidian vault.

Options:
  -f, --force   Overwrite existing plugin files without prompting
  -h, --help    Show this help text
USAGE
}

force="false"
vault_dir=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      print_usage
      exit 0
      ;;
    -f|--force)
      force="true"
      shift
      ;;
    -*)
      echo "Error: unknown option: $1" >&2
      print_usage >&2
      exit 1
      ;;
    *)
      if [ -n "$vault_dir" ]; then
        echo "Error: multiple vault directories provided." >&2
        print_usage >&2
        exit 1
      fi
      vault_dir="$1"
      shift
      ;;
  esac
done

if [ -z "$vault_dir" ]; then
  read -r -p "Enter your Obsidian vault directory: " vault_dir
fi

if [ -z "$vault_dir" ]; then
  echo "Error: vault directory is required." >&2
  exit 1
fi

if [ ! -d "$vault_dir" ]; then
  echo "Error: directory does not exist: $vault_dir" >&2
  exit 1
fi

plugin_dir="$vault_dir/.obsidian/plugins/marginalia"
mkdir -p "$plugin_dir"

if [ "$force" != "true" ] && [ -n "$(ls -A "$plugin_dir" 2>/dev/null)" ]; then
  read -r -p "Plugin directory has files. Overwrite? [y/N] " confirm
  case "$confirm" in
    y|Y|yes|YES)
      ;;
    *)
      echo "Aborted."
      exit 0
      ;;
  esac
fi

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

release_json="$tmp_dir/release.json"
echo "Fetching latest release metadata..."
curl -sL "https://api.github.com/repos/ealt/marginalia/releases/latest" -o "$release_json"

python3 - "$release_json" <<'PY' > "$tmp_dir/assets.txt"
import json
import sys

release_json = sys.argv[1]

with open(release_json, "r", encoding="utf-8") as f:
    data = json.load(f)

assets = data.get("assets", [])
asset_map = {a.get("name"): a.get("browser_download_url") for a in assets}

required = ["main.js", "manifest.json", "styles.css"]
optional = ["versions.json"]
to_download = [name for name in required + optional if name in asset_map]

missing_required = [name for name in required if name not in asset_map]
if missing_required:
    raise SystemExit(
        "Missing required release assets: " + ", ".join(missing_required)
    )

for name in to_download:
    print(f"{name}\t{asset_map[name]}")
PY

echo "Downloading assets..."
while IFS=$'\t' read -r name url; do
  dest="$tmp_dir/$name"
  echo " - $name"
  curl -L --progress-bar "$url" -o "$dest"
done < "$tmp_dir/assets.txt"

for asset in "$tmp_dir"/main.js "$tmp_dir"/manifest.json "$tmp_dir"/styles.css; do
  cp "$asset" "$plugin_dir/"
done

if [ -f "$tmp_dir/versions.json" ]; then
  cp "$tmp_dir/versions.json" "$plugin_dir/"
fi

echo "Installed Marginalia to: $plugin_dir"
