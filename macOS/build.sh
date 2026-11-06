#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ "$(uname -s)" != "Darwin" ]]; then
  printf '%s\n' 'Native macOS builds need macOS and Apple Command Line Tools.' >&2
  exit 1
fi
for tool in node xcrun lipo sips iconutil codesign hdiutil ditto shasum; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'Missing build tool: %s\n' "$tool" >&2
    exit 1
  fi
done
node --experimental-vm-modules generate-models.cjs
version="$(node -p 'require("./package.json").version')"
build_number=24
build_root="$PWD/build"
mkdir -p "$build_root"
staging="$(mktemp -d "$build_root/staging.XXXXXX")"
trap 'rm -rf "$staging"' EXIT
app="$staging/智云助手.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
for architecture in arm64 x86_64; do
  xcrun swiftc -O -target "${architecture}-apple-macosx13.0" \
    -framework Cocoa -framework WebKit -framework Network -framework Security \
    -framework CryptoKit -framework Vision Sources/App.swift \
    -o "$build_root/zhiyun-$architecture"
done
lipo -create "$build_root/zhiyun-arm64" "$build_root/zhiyun-x86_64" -output "$app/Contents/MacOS/Zhiyun"
node bundle-web.cjs "$app/Contents/Resources/web"
icons="$staging/AppIcon.iconset"
mkdir -p "$icons"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" web/icon.png --out "$icons/icon_${size}x${size}.png" >/dev/null
  double=$((size*2))
  sips -z "$double" "$double" web/icon.png --out "$icons/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$icons" -o "$app/Contents/Resources/AppIcon.icns"
cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>智云助手</string>
<key>CFBundleDisplayName</key><string>智云助手</string>
<key>CFBundleIdentifier</key><string>cn.suike.slides.mac.showcase</string>
<key>CFBundleExecutable</key><string>Zhiyun</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>CFBundleShortVersionString</key><string>$version</string>
<key>CFBundleVersion</key><string>$build_number</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
<key>NSHumanReadableCopyright</key><string>智云助手独立学习工具 · 晴空</string>
</dict></plist>
PLIST
cp scripts/zhiyun_mcp.py "$app/Contents/Resources/zhiyun_mcp.py"
cp LICENSE "$app/Contents/Resources/LICENSE-GPL-3.0.txt"
cp THIRD_PARTY_NOTICES.md "$app/Contents/Resources/THIRD_PARTY_NOTICES.md"
# Signing is opt-in; local builds use ad-hoc signatures. Credentials are never
# embedded in this tree. Notarization uses an explicitly configured Keychain profile.
if [[ -n "${ZHIYUN_NOTARY_PROFILE:-}" && -z "${ZHIYUN_SIGN_IDENTITY:-}" ]]; then
  printf '%s\n' 'Notarization requires ZHIYUN_SIGN_IDENTITY.' >&2
  exit 1
fi
if [[ -n "${ZHIYUN_SIGN_IDENTITY:-}" ]]; then
  codesign --force --deep --options runtime --timestamp --sign "$ZHIYUN_SIGN_IDENTITY" --identifier cn.suike.slides.mac.showcase "$app"
else
  codesign --force --deep --sign - --identifier cn.suike.slides.mac.showcase "$app"
fi
codesign --verify --deep --strict "$app"
# Staple the actual staging app before creating BOTH shipping archives.
if [[ -n "${ZHIYUN_NOTARY_PROFILE:-}" ]]; then
  ditto -c -k --norsrc --keepParent "$app" "$staging/notary.zip"
  xcrun notarytool submit "$staging/notary.zip" --keychain-profile "$ZHIYUN_NOTARY_PROFILE" --wait
  xcrun stapler staple "$app"
  xcrun stapler validate "$app"
fi
rm -rf "$build_root/智云助手.app"
ditto "$app" "$build_root/智云助手.app"
dmg_stage="$staging/dmg"
mkdir -p "$dmg_stage"
ditto "$app" "$dmg_stage/智云助手.app"
ln -s /Applications "$dmg_stage/Applications"
hdiutil create -volname "智云助手" -srcfolder "$dmg_stage" -ov -format UDZO "$build_root/智云助手-Mac-$version.dmg" >/dev/null
if [[ -n "${ZHIYUN_SIGN_IDENTITY:-}" ]]; then
  codesign --force --timestamp --sign "$ZHIYUN_SIGN_IDENTITY" "$build_root/智云助手-Mac-$version.dmg"
fi
if [[ -n "${ZHIYUN_NOTARY_PROFILE:-}" ]]; then
  xcrun notarytool submit "$build_root/智云助手-Mac-$version.dmg" --keychain-profile "$ZHIYUN_NOTARY_PROFILE" --wait
  xcrun stapler staple "$build_root/智云助手-Mac-$version.dmg"
  xcrun stapler validate "$build_root/智云助手-Mac-$version.dmg"
fi
ditto -c -k --norsrc --keepParent "$app" "$build_root/智云助手-Mac-$version.zip"
(cd "$build_root" && shasum -a 256 "智云助手-Mac-$version.dmg" "智云助手-Mac-$version.zip" > SHA256SUMS.txt)
printf 'Built universal 晴空 showcase app %s (%s), DMG and ZIP.\n' "$version" "$build_number"
