#!/usr/bin/env bash
# 스토어 1곳에 제출 (release.yml 자동 제출 / submit-store.yml 수동 재제출 공용)
# 사용: scripts/store-submit.sh <chrome|firefox|edge>
# 환경변수: TAG_NAME, DRY_RUN(true면 인증만 확인), 해당 스토어 시크릿
# 입력 ZIP: release/blue-badge-remover-<store>-<tag>.zip (GitHub Release 자산)
set -euo pipefail

STORE="${1:?스토어 이름이 필요합니다 (chrome|firefox|edge)}"
TAG_NAME="${TAG_NAME:?TAG_NAME이 필요합니다}"
ZIP="release/blue-badge-remover-${STORE}-${TAG_NAME}.zip"
DRY_RUN="${DRY_RUN:-false}"
AMO_ATTEMPT_TIMEOUT=900
AMO_RETRY_DELAY=180

require_env() {
  local missing=()
  for name in "$@"; do
    [ -n "${!name:-}" ] || missing+=("$name")
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    echo "::error::${STORE} 제출에 필요한 시크릿이 없습니다: ${missing[*]} (docs/STORE_SETUP.md 참고)"
    exit 1
  fi
}

DRY_RUN_ARGS=()
if [ "$DRY_RUN" = "true" ]; then DRY_RUN_ARGS=(--dry-run); fi

# wxt submit --dry-run은 Edge API 키를 네트워크로 검증하지 않는다(키를 헤더에 넣기만 함).
# 존재하지 않는 작업 ID를 조회해 401/403이면 키가 무효·만료된 것으로 본다. 상태는 바꾸지 않는다.
probe_edge_auth() {
  local url code
  url="https://api.addons.microsoftedge.microsoft.com/v1/products/${EDGE_PRODUCT_ID}/submissions/draft/package/operations/00000000-0000-0000-0000-000000000000"
  code="$(curl -sS -o /dev/null -w '%{http_code}' \
    -H "Authorization: ApiKey ${EDGE_API_KEY}" \
    -H "X-ClientID: ${EDGE_CLIENT_ID}" \
    "$url")"
  case "$code" in
    401|403)
      echo "::error::Edge API 인증 실패 (HTTP ${code}) — Partner Center > Edge > Publish API에서 키 만료 여부를 확인하고 EDGE_API_KEY/EDGE_CLIENT_ID를 갱신하세요"
      return 1
      ;;
    *)
      echo "Edge API 인증 확인 완료 (HTTP ${code})"
      ;;
  esac
}

run_amo_submit() {
  local log="$1"; shift
  timeout "$AMO_ATTEMPT_TIMEOUT" npx wxt submit "$@" 2>&1 | tee "$log"
}

# AMO는 POST /versions/ 응답 전에 10분에서 연결을 끊은 적이 있다(v1.4.1, v1.6.0).
# 이때 서버에서는 버전이 생성됐을 수 있으므로(v1.4.1이 그랬음), 기다렸다가 1회 재시도하고
# "이미 존재함(409)"이면 첫 시도가 처리된 것으로 보고 성공 처리한다.
# 재시도는 업로드·검증부터 다시 하므로 최악의 경우 약 33분(15분 + 3분 + 15분)이 걸린다.
submit_firefox() {
  local sources="release/blue-badge-remover-firefox-sources-${TAG_NAME}.zip"
  local args=(--firefox-zip "$ZIP")
  if [ -f "$sources" ]; then
    args+=(--firefox-sources-zip "$sources")
  else
    echo "::warning::소스 ZIP(${sources})이 없어 소스 없이 제출합니다 — AMO 심사에서 소스 요청이 올 수 있습니다"
  fi

  if [ "$DRY_RUN" = "true" ]; then
    npx wxt submit --dry-run "${args[@]}"
    return
  fi

  if run_amo_submit amo-attempt-1.log "${args[@]}"; then return 0; fi
  echo "::warning::AMO 제출 실패 — ${AMO_RETRY_DELAY}초 뒤 1회 재시도해 서버 측 생성 여부를 확인합니다"
  sleep "$AMO_RETRY_DELAY"
  if run_amo_submit amo-attempt-2.log "${args[@]}"; then return 0; fi
  if grep -Eq ': 409|409 Conflict|[Aa]lready exists' amo-attempt-2.log; then
    echo "::notice::AMO에 ${TAG_NAME} 버전이 이미 있습니다 — 첫 시도가 서버에서 처리된 것으로 보고 성공 처리합니다"
    return 0
  fi
  return 1
}

if [ ! -f "$ZIP" ]; then
  echo "::error::${ZIP}이 없습니다 — ${TAG_NAME} GitHub Release에 ${STORE} ZIP이 첨부돼 있는지 확인하세요"
  exit 1
fi

case "$STORE" in
  chrome)
    require_env CHROME_EXTENSION_ID CHROME_CLIENT_ID CHROME_CLIENT_SECRET CHROME_REFRESH_TOKEN
    npx wxt submit ${DRY_RUN_ARGS[@]+"${DRY_RUN_ARGS[@]}"} --chrome-zip "$ZIP"
    ;;
  firefox)
    require_env FIREFOX_EXTENSION_ID FIREFOX_JWT_ISSUER FIREFOX_JWT_SECRET
    submit_firefox
    ;;
  edge)
    require_env EDGE_PRODUCT_ID EDGE_CLIENT_ID EDGE_API_KEY
    probe_edge_auth
    npx wxt submit ${DRY_RUN_ARGS[@]+"${DRY_RUN_ARGS[@]}"} --edge-zip "$ZIP"
    ;;
  *)
    echo "::error::알 수 없는 스토어: ${STORE}"
    exit 1
    ;;
esac
