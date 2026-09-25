#!/usr/bin/env bash
# 스토어 제출용 ZIP 생성 — release/blue-badge-remover-<browser>-<tag>.zip
# Firefox는 AMO 소스 제출용 ZIP도 함께 만든다 (번들이 minify되어 AMO 정책상 소스 제출 대상).
# 사용: scripts/package-release.sh <tag>
set -euo pipefail

TAG="${1:?태그 이름이 필요합니다 (예: v1.6.1)}"
# wxt의 {{name}} 템플릿과 같은 값 (package.json name)
NAME="$(node -p "require('./package.json').name")"
VERSION="$(node -p "require('./package.json').version")"
OUT_DIR="release"

mkdir -p "$OUT_DIR"

for browser in chrome edge firefox; do
  npx wxt zip -b "$browser"
  mv "dist/${NAME}-${VERSION}-${browser}.zip" "${OUT_DIR}/${NAME}-${browser}-${TAG}.zip"
done

# wxt zip -b firefox는 zipSources 기본값으로 소스 ZIP을 함께 만든다
mv "dist/${NAME}-${VERSION}-sources.zip" "${OUT_DIR}/${NAME}-firefox-sources-${TAG}.zip"

ls -la "$OUT_DIR"
