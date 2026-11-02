#!/bin/bash
# showcase-review.sh <output-folder> [light|dark]: headless captures of the real pages with synthetic lessons.
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
bin_dir="$project_dir/build/review-bin"
mkdir -p "$bin_dir"
if [[ ! -x "$bin_dir/showcase-review" || "$project_dir/Sources/App.swift" -nt "$bin_dir/showcase-review" || "$project_dir/tests/ShowcaseReview.swift" -nt "$bin_dir/showcase-review" ]]; then
  sed '/^let application=NSApplication.shared/,$d' "$project_dir/Sources/App.swift" > "$bin_dir/Bridge.swift"
  sed 's/^@main struct WebKitAppSmoke/struct WebKitAppSmoke/' "$project_dir/tests/WebKitAppSmoke.swift" > "$bin_dir/SmokeSupport.swift"
  xcrun swiftc -D NATIVE_CONTRACT_TESTS -parse-as-library -target "$(uname -m)-apple-macos13.0" "$bin_dir/Bridge.swift" "$bin_dir/SmokeSupport.swift" "$project_dir/tests/ShowcaseReview.swift" -o "$bin_dir/showcase-review"
fi
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/zhiyun-showcase.XXXXXX")"
trap 'rm -rf "$test_dir"' EXIT
"$bin_dir/showcase-review" "$project_dir/web" "$test_dir" "$1" "${2:-light}"
