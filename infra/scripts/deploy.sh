#!/usr/bin/env bash
# 앵로그 수동 배포. 서버에서 실행: anglog-deploy  (또는 infra/scripts/deploy.sh)
#
# - origin/main을 받아서 바뀐 부분의 컨테이너만 다시 빌드하고 교체한다
#     backend/  → api,  realtime/ → realtime,  frontend/ → web,  infra/docker-compose.yml → 전부
# - 문서만 바뀌었으면 코드만 갱신 (접속자 연결 유지)
# - 교체 후 상태 확인이 실패하면 이전 커밋으로 되돌려 다시 띄운다. 같은 커밋은 FORCE=1 없이 다시 시도하지 않는다
#
# 이 파일도 git pull로 바뀔 수 있어서 전체를 main 함수로 감싸 끝까지 읽은 뒤 실행한다.
set -euo pipefail

main() {
  local self repo_dir
  self=$(readlink -f "$0")
  repo_dir="${REPO_DIR:-$(cd "$(dirname "$self")/../.." && pwd)}"
  local branch="${BRANCH:-main}"
  local state_dir="${STATE_DIR:-$HOME/anglog-state}"
  local log_file="$state_dir/deploy.log"
  local failed_file="$state_dir/.deploy-failed"
  local infra="$repo_dir/infra"

  mkdir -p "$state_dir"
  log() { echo "[$(date '+%F %T')] $*" | tee -a "$log_file"; }

  exec 9>"/tmp/anglog-deploy.lock"
  flock -n 9 || { echo "다른 배포가 진행 중"; exit 1; }

  cd "$repo_dir"
  [[ -f "$infra/.env" ]] || { echo "infra/.env 가 없음. README의 처음 설정부터"; exit 1; }
  # 금칙어 파일이 없으면 Docker가 같은 이름의 폴더를 만들어 버리므로 빈 파일이라도 둔다
  [[ -e "$infra/blocked-words.txt" ]] || touch "$infra/blocked-words.txt"

  if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    log "중단: 서버 레포에 커밋되지 않은 수정이 있음. 맥에서 커밋하고 서버는 git checkout -- <파일> 로 되돌릴 것"
    git status --short | tee -a "$log_file"
    exit 1
  fi

  git fetch --quiet origin "$branch"
  local old new
  old=$(git rev-parse HEAD)
  new=$(git rev-parse "origin/$branch")
  local first=0
  [[ -z "$(cd "$infra" && docker compose ps -q 2>/dev/null)" ]] && first=1

  if [[ "$old" == "$new" && "${FORCE:-0}" != "1" && $first == 0 ]]; then
    echo "새 커밋 없음 (${old:0:7})"
    exit 0
  fi
  if [[ "${FORCE:-0}" != "1" && -f "$failed_file" && "$(cat "$failed_file")" == "$new" ]]; then
    echo "${new:0:7}은 이전에 배포 실패한 커밋이라 건너뜀. 다시 시도: FORCE=1 anglog-deploy"
    exit 0
  fi

  # 무엇을 다시 띄울지
  local services=()
  if [[ $first == 1 || "${FORCE:-0}" == "1" ]] || ! git diff --quiet "$old" "$new" -- infra/docker-compose.yml; then
    services=(db api realtime web)
  else
    git diff --quiet "$old" "$new" -- backend/ || services+=(api)
    git diff --quiet "$old" "$new" -- realtime/ || services+=(realtime)
    git diff --quiet "$old" "$new" -- frontend/ || services+=(web)
  fi

  git merge --ff-only --quiet "origin/$branch"
  if [[ ${#services[@]} -eq 0 ]]; then
    log "앱 변경 없음, 코드만 갱신: ${old:0:7} -> ${new:0:7}"
    exit 0
  fi
  log "배포 시작: ${old:0:7} -> ${new:0:7} [${services[*]}] ($(git log -1 --format=%s "$new"))"

  up() {
    # 빌드를 먼저 끝내고 교체한다. 빌드하는 동안 기존 컨테이너는 계속 돈다
    (cd "$infra" && docker compose build "$@" >>"$log_file" 2>&1) || return 1
    (cd "$infra" && docker compose up -d --remove-orphans "$@" >>"$log_file" 2>&1) || return 1
    healthy "$@"
  }

  # 각 컨테이너가 대답할 때까지 (최대 2분). 확인은 web 컨테이너 안에서 (호스트에 포트를 열지 않으므로)
  healthy() {
    local svc url
    for svc in "$@"; do
      case "$svc" in
        api) url=http://api:8080/actuator/health ;;
        realtime) url=http://realtime:8090/actuator/health ;;
        web) url=http://127.0.0.1/ ;;
        *) continue ;;
      esac
      local ok=0
      for _ in $(seq 1 60); do
        if (cd "$infra" && docker compose exec -T web wget -q -O - "$url" 2>/dev/null | grep -qE '"status":"UP"|<html'); then ok=1; break; fi
        sleep 2
      done
      if [[ $ok == 0 ]]; then
        log "상태 확인 실패: $svc ($url)"
        (cd "$infra" && docker compose logs --tail 40 "$svc" >>"$log_file" 2>&1) || true
        return 1
      fi
    done
  }

  if up "${services[@]}"; then
    rm -f "$failed_file"
    log "배포 완료: ${new:0:7}"
    (cd "$infra" && docker image prune -f >/dev/null 2>&1) || true
    return 0
  fi

  log "배포 실패, ${old:0:7} 로 되돌림"
  echo "$new" > "$failed_file"
  git reset --quiet --hard "$old"
  if [[ $first == 1 ]] || ! up "${services[@]}"; then
    log "되돌린 버전도 뜨지 않음. 서버에서 확인 필요: cd $infra && docker compose ps && docker compose logs --tail 100"
  else
    log "되돌림 완료: ${old:0:7}"
  fi
  exit 1
}

main "$@"
