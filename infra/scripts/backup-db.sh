#!/usr/bin/env bash
# 앵로그 DB와 사진 백업. 서버의 crontab에서 하루 한 번:
#   30 4 * * * $HOME/anglog/anglog/infra/scripts/backup-db.sh >> $HOME/anglog-state/backup.log 2>&1
# DB는 매일, 사진(media 볼륨)은 일요일마다. 14일 지난 파일은 지운다.
# 서버가 통째로 사라지면 같이 사라지므로, 가끔 맥으로 받아 둘 것 (README 참고)
set -euo pipefail

infra="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
out="${BACKUP_DIR:-$HOME/anglog-backups}"
mkdir -p "$out"
stamp=$(date '+%Y%m%d-%H%M')

cd "$infra"
docker compose exec -T db pg_dump -U anglog -d anglog --no-owner | gzip > "$out/anglog-db-$stamp.sql.gz"
echo "[$(date '+%F %T')] DB 백업: $out/anglog-db-$stamp.sql.gz ($(du -h "$out/anglog-db-$stamp.sql.gz" | cut -f1))"

if [[ "$(date +%u)" == "7" ]]; then
  docker run --rm -v anglog_media:/media:ro -v "$out":/out alpine tar czf "/out/anglog-media-$stamp.tgz" -C /media .
  echo "[$(date '+%F %T')] 사진 백업: $out/anglog-media-$stamp.tgz"
fi

find "$out" -name 'anglog-*' -mtime +14 -delete
