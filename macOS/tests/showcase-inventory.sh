#!/bin/bash
# showcase-inventory.sh <output-folder> [light|dark]: headless captures of every page, dialog and control state.
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
bin_dir="$project_dir/build/inventory-bin"
mkdir -p "$bin_dir"
if [[ ! -x "$bin_dir/showcase-inventory" || "$project_dir/Sources/App.swift" -nt "$bin_dir/showcase-inventory" || "$project_dir/tests/ShowcaseInventory.swift" -nt "$bin_dir/showcase-inventory" ]]; then
  sed '/^let application=NSApplication.shared/,$d' "$project_dir/Sources/App.swift" > "$bin_dir/Bridge.swift"
  sed 's/^@main struct WebKitAppSmoke/struct WebKitAppSmoke/' "$project_dir/tests/WebKitAppSmoke.swift" > "$bin_dir/SmokeSupport.swift"
  xcrun swiftc -D NATIVE_CONTRACT_TESTS -parse-as-library -target "$(uname -m)-apple-macos13.0" "$bin_dir/Bridge.swift" "$bin_dir/SmokeSupport.swift" "$project_dir/tests/ShowcaseInventory.swift" -o "$bin_dir/showcase-inventory" 2>&1 | grep -E "error" || true
fi
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/zhiyun-inventory.XXXXXX")"
trap 'rm -rf "$test_dir"' EXIT
rm -rf "$1"
"$bin_dir/showcase-inventory" "$project_dir/web" "$test_dir" "$1" "${2:-light}"
