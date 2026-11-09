#!/usr/bin/env bash
# 메타모아(metamoa.com) 등록과 연결. 서버에서 실행: infra/scripts/metamoa.sh <명령>
#
#   submit      등록 신청(한 번만). 신청 번호와 request_key를 infra/.env에 바로 적고 화면에는 키를 보이지 않는다
#   status      심사 결과 보기 (METAMOA_SUBMIT_ID, METAMOA_REQUEST_KEY 사용)
#   character   야영지 캐릭터 올리기 (frontend/public/metamoa-character.png, METAMOA_KEY와 METAMOA_SPACE_ID 필요)
#   character-status  캐릭터 검사 결과 보기
#
# 키(request_key, METAMOA_KEY)는 infra/.env에만 둔다. 채팅이나 커밋에 붙여 넣지 않는다.
# 접속자 수는 실시간 서버가 10분마다, 소식과 이벤트는 관리자 페이지에서 보낸다(둘 다 METAMOA_KEY, METAMOA_SPACE_ID 사용).
set -euo pipefail

infra="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
env_file="$infra/.env"
base="${METAMOA_BASE:-https://metamoa.com}"
[[ -f "$env_file" ]] || { echo "infra/.env 가 없음"; exit 1; }

get_env() { grep -E "^$1=" "$env_file" | tail -n 1 | cut -d= -f2- || true; }
set_env() {
  if grep -qE "^$1=" "$env_file"; then
    sed -i "s|^$1=.*|$1=$2|" "$env_file"
  else
    echo "$1=$2" >> "$env_file"
  fi
}

case "${1:-}" in
  submit)
    if [[ -n "$(get_env METAMOA_SUBMIT_ID)" ]]; then
      echo "이미 신청했음(METAMOA_SUBMIT_ID=$(get_env METAMOA_SUBMIT_ID)). 결과는: $0 status"
      exit 0
    fi
    body='{
      "name": "앵파크",
      "url": "https://anglog.nobody-asked.dev/",
      "region": "kr",
      "mode": "multi",
      "langs": ["ko"],
      "summary": "앵무새가 되어 가을 공원을 날고, 다른 앵무들과 장난치며 노는 웹 메타버스",
      "og_image": "https://anglog.nobody-asked.dev/og-image.jpg",
      "api_hookup": true,
      "agree": true
    }'
    out=$(mktemp); trap 'rm -f "$out"' EXIT
    code=$(curl -sS -m 30 -o "$out" -w '%{http_code}' -X POST "$base/api/submit" \
      -H 'Content-Type: application/json' --data "$body")
    if [[ "$code" != "201" ]]; then
      echo "신청 실패 (HTTP $code):"; cat "$out"; echo; exit 1
    fi
    # 키는 화면에 찍지 않고 .env로만
    id=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "$out")
    key=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["request_key"])' "$out")
    set_env METAMOA_SUBMIT_ID "$id"
    set_env METAMOA_REQUEST_KEY "$key"
    chmod 600 "$env_file"
    echo "신청 완료. 신청 번호: $id (request_key는 infra/.env에 저장함)"
    python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print("상태 주소:", d.get("status_url"))' "$out"
    ;;
  status)
    id=$(get_env METAMOA_SUBMIT_ID); key=$(get_env METAMOA_REQUEST_KEY)
    [[ -n "$id" && -n "$key" ]] || { echo "먼저 $0 submit"; exit 1; }
    curl -sS -m 20 "$base/api/submit/$id" -H "Authorization: Bearer $key"; echo
    ;;
  character)
    space=$(get_env METAMOA_SPACE_ID); key=$(get_env METAMOA_KEY)
    [[ -n "$space" && -n "$key" ]] || { echo "infra/.env에 METAMOA_SPACE_ID와 METAMOA_KEY를 먼저 넣을 것"; exit 1; }
    file="$infra/../frontend/public/metamoa-character.png"
    curl -sS -m 60 -X PUT "$base/api/space/$space/character" -H "Authorization: Bearer $key" \
      -H 'Content-Type: image/png' --data-binary "@$file"; echo
    ;;
  character-status)
    space=$(get_env METAMOA_SPACE_ID); key=$(get_env METAMOA_KEY)
    [[ -n "$space" && -n "$key" ]] || { echo "infra/.env에 METAMOA_SPACE_ID와 METAMOA_KEY를 먼저 넣을 것"; exit 1; }
    curl -sS -m 20 "$base/api/space/$space/character" -H "Authorization: Bearer $key"; echo
    ;;
  *)
    sed -n 2,11p "$0"; exit 1 ;;
esac
