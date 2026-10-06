#!/usr/bin/env bash
set -euo pipefail

core_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
app_dir="$(cd "$core_dir/.." && pwd)"
cd "$core_dir"

platform="${1:-}"
case "$platform" in
  android|ios) ;;
  *) echo "Usage: $0 android|ios [iOS bundle ID]" >&2; exit 2 ;;
esac

export GOPATH="${GOPATH:-$app_dir/.tools/go}"
export GOBIN="$GOPATH/bin"
export GOMODCACHE="${GOMODCACHE:-$app_dir/.tools/go-mod}"
export GOCACHE="${GOCACHE:-$app_dir/.tools/go-cache}"
mkdir -p "$GOBIN"
export PATH="$GOBIN:$PATH"
go install golang.org/x/mobile/cmd/gomobile golang.org/x/mobile/cmd/gobind

if [[ "$platform" == android ]]; then
  mkdir -p "$app_dir/mobile/android/app/libs"
  gomobile bind -target=android -o "$app_dir/mobile/android/app/libs/st-core.aar" ./mobilecore
else
  bundle_id="${2:-com.northstar.mobile}"
  mkdir -p "$app_dir/mobile/ios/Frameworks"
  gomobile bind -target=ios -bundleid "$bundle_id" -o "$app_dir/mobile/ios/Frameworks/STCore.xcframework" ./mobilecore
fi
