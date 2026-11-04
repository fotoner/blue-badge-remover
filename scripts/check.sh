#!/usr/bin/env bash
# 검사 3단계 (AGENTS.md "검증", .claude/rules/harness.md HAR-7).
#   --quick <패턴>     편집 중: 패턴에 맞는 vitest만
#   --changed [--base <rev>]  작업 끝: 바꾼 것에 닿는 검사. 설정·검사 스크립트·CI가 바뀌면 전체 시험으로 넓힌다
#   (인자 없음)        전체: 지침·타입·린트·전체 시험·Chrome/Firefox 빌드
# 종료 코드: 0 통과, 1 실패, 2 사용법 오류
set -uo pipefail
cd "$(dirname "$0")/.."

usage='사용: scripts/check.sh [--quick <vitest 패턴> | --changed [--base <rev>]]'
mode=full
pattern=''
base=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --quick) mode=quick; pattern="${2-}"; shift; [[ $# -gt 0 ]] && shift ;;
    --changed) mode=changed; shift ;;
    --base) base="${2-}"; shift; [[ $# -gt 0 ]] && shift ;;
    -h|--help) echo "$usage"; exit 0 ;;
    *) echo "$usage" >&2; exit 2 ;;
  esac
done

passed=()
failed=()
run() {
  local name="$1"; shift
  echo "▸ $name"
  if "$@"; then passed+=("$name"); else failed+=("$name"); fi
}
finish() {
  echo "── 검사 요약 ($mode) ──"
  for name in "${passed[@]+"${passed[@]}"}"; do echo "  ✓ $name"; done
  for name in "${failed[@]+"${failed[@]}"}"; do echo "  ✘ $name"; done
  [[ ${#failed[@]} -eq 0 ]] && exit 0 || exit 1
}

docs() { node scripts/check-docs.mjs; }
types() { npx tsc --noEmit --skipLibCheck; }
lint() { npx eslint .; }
all_tests() { npx vitest run; }

if [[ "$mode" == quick ]]; then
  [[ -z "$pattern" ]] && { echo "$usage" >&2; exit 2; }
  run "시험: $pattern" npx vitest run "$pattern"
  finish
fi

if [[ "$mode" == full ]]; then
  run "지침" docs
  run "타입" types
  run "린트" lint
  run "전체 시험" all_tests
  run "Chrome 빌드" npm run -s build:chrome
  run "Firefox 빌드" npm run -s build:firefox
  finish
fi

# --changed: 기준은 origin/dev와의 merge-base. 못 구하면 조용히 좁히지 않고 전체 시험으로 넓힌다
# 받은 --base가 없는 리비전이면 변경 목록이 비어 검사가 좁아지므로 멈춘다
if [[ -n "$base" ]] && ! git rev-parse --verify --quiet "$base^{commit}" > /dev/null; then
  echo "기준 리비전을 찾지 못했습니다: $base" >&2
  exit 2
fi
widen=''
if [[ -z "$base" ]]; then
  base="$(git merge-base HEAD origin/dev 2>/dev/null || true)"
  [[ -z "$base" ]] && widen='기준(origin/dev)을 구하지 못함'
fi
changed=()
if [[ -n "$base" ]]; then
  while IFS= read -r file; do [[ -n "$file" ]] && changed+=("$file"); done \
    < <( { git diff --name-only "$base"; git ls-files --others --exclude-standard; } | sort -u)
fi
echo "기준: ${base:-없음} · 바뀐 파일 ${#changed[@]}개"

code_files=()
for file in "${changed[@]+"${changed[@]}"}"; do
  case "$file" in
    package.json|package-lock.json|tsconfig*.json|vitest.config.ts|wxt.config.ts|eslint.config.js|playwright.config.ts|scripts/check.sh|.github/*)
      widen="${widen:-설정·검사 스크립트·CI 변경($file)}" ;;
  esac
  # 지운 소스는 남은 import를 깨뜨릴 수 있다. 관련 시험으로는 못 찾으므로 넓힌다
  case "$file" in
    src/*|entrypoints/*|tests/*|e2e/*|scripts/*) [[ -e "$file" ]] || widen="${widen:-소스 삭제($file)}" ;;
  esac
  case "$file" in
    src/*.ts|entrypoints/*.ts|tests/*.ts|e2e/*.ts) code_files+=("$file") ;;
    src/*|entrypoints/*|tests/*|e2e/*|scripts/*) widen="${widen:-코드 밖 소스 변경($file)}" ;;
  esac
done

# 공개 저장소 위생(AGENTS.md SAFE-8): 추가된 줄의 개인 경로·키 모양 문자열
secrets() {
  local pattern='/Users/[A-Za-z]|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY'
  local hits
  hits="$( { [[ -n "$base" ]] && git diff -U0 "$base" -- . ':!scripts/check.sh' | grep '^+' | grep -v '^+++'; \
    git ls-files --others --exclude-standard -z | xargs -0 grep -nIHE "$pattern" -- 2>/dev/null; } | grep -E "$pattern" || true)"
  [[ -z "$hits" ]] && return 0
  echo "$hits" | head -20
  echo "✘ 개인 경로나 비밀값처럼 보이는 줄이 있습니다(SAFE-8)" >&2
  return 1
}

run "지침" docs
run "공개 저장소 위생" secrets
if [[ -n "$widen" ]]; then
  echo "▸ 전체 시험으로 넓힙니다: $widen"
  run "타입" types
  run "린트" lint
  run "전체 시험" all_tests
elif [[ ${#code_files[@]} -gt 0 ]]; then
  run "타입" types
  run "린트(바뀐 파일)" npx eslint "${code_files[@]}"
  run "관련 시험" npx vitest related --run --passWithNoTests "${code_files[@]}"
else
  echo "▸ 코드 변경 없음 — 지침·위생 검사만"
fi
finish
