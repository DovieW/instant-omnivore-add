#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_dir="${1:-$repo_root/dist}"
version="$(jq -r '.version' "$repo_root/manifest.json")"

if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid manifest version: $version" >&2
  exit 1
fi

for required_tool in jq zip unzip; do
  if ! command -v "$required_tool" >/dev/null 2>&1; then
    echo "Missing required tool: $required_tool" >&2
    exit 1
  fi
done

package_tmp_dir="$(mktemp -d)"
trap 'rm -rf -- "$package_tmp_dir"' EXIT

stage_dir="$package_tmp_dir/instant-omnivore-add-$version"
staged_artifact="$package_tmp_dir/instant-omnivore-add-$version.zip"
artifact="$output_dir/instant-omnivore-add-$version.zip"
mkdir -p "$stage_dir/assets/icons" "$output_dir"

install -m 0644 \
  "$repo_root/manifest.json" \
  "$repo_root/background.js" \
  "$repo_root/contentScript.js" \
  "$repo_root/popup.html" \
  "$repo_root/popup.css" \
  "$repo_root/popup.js" \
  "$repo_root/PRIVACY.md" \
  "$stage_dir/"

install -m 0644 \
  "$repo_root/assets/icons/icon-a-16.png" \
  "$repo_root/assets/icons/icon-a-32.png" \
  "$repo_root/assets/icons/icon-a-48.png" \
  "$repo_root/assets/icons/icon-a-128.png" \
  "$stage_dir/assets/icons/"

# Normalize timestamps and add files in a fixed order so identical source trees
# produce byte-for-byte identical Chrome Web Store packages.
find "$stage_dir" -exec touch -t 200001010000 {} +

(
  cd "$stage_dir"
  zip -X -q "$staged_artifact" \
    manifest.json \
    background.js \
    contentScript.js \
    popup.html \
    popup.css \
    popup.js \
    PRIVACY.md \
    assets/icons/icon-a-16.png \
    assets/icons/icon-a-32.png \
    assets/icons/icon-a-48.png \
    assets/icons/icon-a-128.png
)

unzip -t "$staged_artifact" >/dev/null
if [[ "$(unzip -Z1 "$staged_artifact" | head -n 1)" != "manifest.json" ]]; then
  echo "Package must contain manifest.json at its root" >&2
  exit 1
fi

mv -f -- "$staged_artifact" "$artifact"
sha256sum "$artifact"
