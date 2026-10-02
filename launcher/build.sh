#!/usr/bin/env bash
# Builds the Windows game (native window via WebView2) and a Linux launcher (opens the browser) into release/.
# Usage: launcher/build.sh [version]
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="${1:-dev}"
npm run build
rm -rf launcher/web && mkdir -p launcher/web
cp index.html launcher/web/
cp -r assets dist launcher/web/
mkdir -p release
cd launcher
# Windows resources: app icon, version info and a DPI-aware manifest.
go run github.com/tc-hib/go-winres@v0.3.3 make --in winres/winres.json --arch amd64 --product-version "${VERSION#v}" --file-version "${VERSION#v}" 2>/dev/null \
  || go run github.com/tc-hib/go-winres@v0.3.3 make --in winres/winres.json --arch amd64
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -H=windowsgui -X main.version=$VERSION" -o ../release/MeridianReach.exe .
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.version=$VERSION" -o ../release/meridian-reach-linux .
echo "built release/MeridianReach.exe ($VERSION)"
