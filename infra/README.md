# infra

앵로그 운영 구성과 배포. 지금은 고해야지 app 서버(Rocky Linux, Docker)에 같이 올리고, 그 서버의 앞단 Nginx를 같이 쓴다.

실제 IP, 비밀번호는 레포에 넣지 않는다. 아래 `<APP_IP>`, `<서버키>`, `<메일>`은 각자 값으로 바꿔 읽을 것. 값이 필요한 설정은 git에서 제외된 `infra/.env`에 둔다.

```
인터넷 ──443──> 고해야지 Nginx (TLS, 요청 속도 제한)
                  │  anglog.nobody-asked.dev
                  └── anglog-edge 네트워크 ──> web (빌드한 화면, 안쪽 프록시)
                                                ├── /api, /media ──> api (Spring, 8080) ──> db (PostgreSQL)
                                                └── /ws ───────────> realtime (앵파크 실시간, 8090)
```

```
infra/
  docker-compose.yml             db, api, realtime, web (포트를 호스트에 열지 않음)
  .env.example                   DOMAIN, DB_PASSWORD
  scripts/deploy.sh              수동 배포 (git pull → 바뀐 컨테이너만 재빌드, 실패 시 롤백)
  scripts/backup-db.sh           DB 매일, 사진 매주 백업
  front-nginx/anglog.conf.template  고해야지 infra/app/nginx/ 에 두는 앞단 설정 (원본)
```

고해야지와 얽히는 곳은 앞단 Nginx 한 곳뿐이다. 앵로그 컨테이너가 모두 내려가도 고해야지는 그대로 돌고(앵로그 주소만 502), 고해야지를 내려도 앵로그 스택은 그대로다. 고해야지 서버를 닫게 되면 이 스택을 다른 서버로 옮기고 앞단만 새로 세우면 된다 (아래 "다른 서버로 옮길 때").

---

## 0. 먼저 확인

서버 메모리. 앵로그가 최대 약 1.5 GB를 더 쓴다 (db 384 MB, api 640 MB, realtime 384 MB, web 64 MB).

```bash
free -h
docker stats --no-stream
```

남는 메모리가 1.5 GB보다 적으면 `docker-compose.yml`의 `mem_limit`을 줄이거나 스왑을 늘린다.

## 1. 처음 한 번

**DNS** (Cloudflare, nobody-asked.dev)

| 종류 | 이름 | 값 | 프록시 |
|---|---|---|---|
| A | `anglog` | `<APP_IP>` | 끔 (DNS only, 회색 구름) |

프록시를 켜면 인증서 발급과 실제 접속자 IP 확인이 꼬인다. api.gohaeyaji.com과 같은 방식.

**서버에서**

```bash
git clone https://github.com/hae-gun/anglog.git ~/anglog/anglog
docker network create anglog-edge

cd ~/anglog/anglog/infra
cp .env.example .env
sed -i "s|^DOMAIN=.*|DOMAIN=anglog.nobody-asked.dev|; s|^DB_PASSWORD=.*|DB_PASSWORD=$(openssl rand -hex 24)|" .env
cat .env        # 확인만. DB_PASSWORD는 어디에도 따로 적을 필요 없다

sudo ln -sf ~/anglog/anglog/infra/scripts/deploy.sh /usr/local/bin/anglog-deploy
anglog-deploy   # 처음엔 네 컨테이너를 모두 빌드한다. 몇 분 걸림
```

`배포 완료`가 나오면 스택은 떠 있다. 아직 밖에서는 안 보인다 (앞단 연결 전).

**인증서** (고해야지 Nginx가 떠 있는 상태 그대로 발급된다. 80번의 첫 server 블록이 어떤 주소로 와도 인증 파일을 내준다)

```bash
cd ~/gohae/online_gohaeyaji/infra/app
docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
  -d anglog.nobody-asked.dev -m <메일> --agree-tos -n
```

갱신은 고해야지의 기존 cron(`certbot renew`)이 모든 인증서를 함께 갱신하므로 따로 할 일 없다.

**앞단 연결** (순서 중요: 인증서가 먼저 있어야 Nginx가 뜬다)

1. 고해야지 `infra/app/.env`에 한 줄 추가: `ANGLOG_DOMAIN=anglog.nobody-asked.dev`
2. 고해야지 저장소에 들어간 앵로그 앞단 변경(`infra/app/nginx/anglog.conf.template`, `infra/app/docker-compose.yml`)을 맥에서 커밋, 푸시
3. 서버에서 `gohae-deploy` (Nginx를 새 네트워크로 다시 만들고 `nginx -t`까지 확인)

**확인**

- https://anglog.nobody-asked.dev 가 앵파크로 열린다
- 가입하고 앵무 등록, 사진 일기 한 편
- 창 두 개로 앵파크에 들어가서 서로의 앵무가 보이는지 (개발자 도구에서 `wss://anglog.nobody-asked.dev/ws`가 101)

**백업** (`crontab -e`)

```
30 4 * * * $HOME/anglog/anglog/infra/scripts/backup-db.sh >> $HOME/anglog-state/backup.log 2>&1
```

## 2. 배포

맥에서 커밋, 푸시한 뒤:

```bash
ssh -i ~/.ssh/<서버키> rocky@<APP_IP> anglog-deploy
```

| 바뀐 곳 | 다시 띄우는 것 |
|---|---|
| `backend/` | api |
| `realtime/` | realtime (앵파크 접속자가 잠깐 끊겼다가 다시 붙는다) |
| `frontend/` | web |
| `infra/docker-compose.yml` | 전부 |
| 그 밖(문서 등) | 없음, 코드만 갱신 |
| 상태 확인 실패 | 이전 커밋으로 되돌려 다시 띄움. 같은 커밋은 `FORCE=1 anglog-deploy`로만 다시 시도 |

기록: 서버의 `~/anglog-state/deploy.log`

**주의**
- 서버에서 레포 파일을 직접 고치면 배포가 멈춘다. 수정은 항상 맥에서 커밋.
- `docker compose down -v` 는 하지 말 것. `-v`가 DB와 사진 볼륨을 지운다.
- `infra/.env`를 바꿨으면 `cd ~/anglog/anglog/infra && docker compose up -d`. DOMAIN을 바꿨으면 `FORCE=1 anglog-deploy` (화면에 주소가 빌드되어 들어가므로).

## 3. 자주 보는 것

```bash
cd ~/anglog/anglog/infra
docker compose ps
docker compose logs --tail 100 api        # realtime, web, db 도 같은 식
docker compose exec db psql -U anglog     # DB 직접 보기
```

이름 금칙어: `infra/blocked-words.txt`에 한 줄에 하나 (git에 올라가지 않는다). 고친 뒤 `docker compose restart realtime`.

## 4. 백업을 맥으로 받기, 되살리기

```bash
# 맥에서
scp -i ~/.ssh/<서버키> "rocky@<APP_IP>:anglog-backups/anglog-db-*.sql.gz" ~/anglog-backups/

# 서버에서 되살리기 (지금 DB를 덮어씀)
cd ~/anglog/anglog/infra
gunzip -c ~/anglog-backups/anglog-db-<날짜>.sql.gz | docker compose exec -T db psql -U anglog -d anglog
```

## 5. 다른 서버로 옮길 때

1. 새 서버에서 1번(처음 한 번)의 "서버에서"까지
2. 옛 서버의 최신 DB 백업과 사진 백업을 옮겨 되살린다 (사진: `docker run --rm -v anglog_media:/media -v $PWD:/in alpine tar xzf /in/anglog-media-<날짜>.tgz -C /media`)
3. 앞단: 새 서버에는 고해야지 Nginx가 없으므로 Nginx와 certbot만 있는 작은 앞단을 세우고 `front-nginx/anglog.conf.template`을 그대로 쓴다
4. DNS의 `anglog` A 레코드를 새 IP로 바꾼다
