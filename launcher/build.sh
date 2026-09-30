#!/usr/bin/env bash
# Builds the Windows launcher (and a Linux one for testing) into release/.
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
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -H=windowsgui -X main.version=$VERSION" -o ../release/MeridianReach.exe .
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o ../release/meridian-reach-linux .
echo "built release/MeridianReach.exe ($VERSION)"
