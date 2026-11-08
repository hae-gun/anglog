# 짹로그 (jjaklog)

우리 앵무의 하루를 기록하고, 서로의 방에 놀러가는 앵무 일기 SNS.
웹(PWA)으로 먼저 반응을 보고, 같은 코드를 감싸 앱으로 낼 계획이다.

- 일기: 사진 여러 장, 글, 그리고 선택 기록(체중 g, 기분)
- 피드: 팔로잉 / 최신, 좋아요, 댓글
- 내 방(3D): 프로필이 사진 격자가 아니라 내 앵무가 사는 방
  - 벽 액자 = 최근 사진 일기 (누르면 그 일기가 열림)
  - 앵무 = 내가 등록한 앵무와 색, 최근 기분이 자세로 보임
  - 체중계 = 최근 체중
  - 선반 = 첫 일기, 7일 연속 기록, 생일, 함께한 지 100일 같은 기념품
  - 바닥 깃털 = 놀러온 사람이 하루 한 번 남기는 흔적
  - 방명록

## 폴더

```
backend/    Spring Boot 3.3.5, Java 21, PostgreSQL + Flyway (테스트는 H2)
frontend/   Vite + React + TypeScript, three.js 0.128 (3D 방)
docs/       기획과 API 정리
docker-compose.yml  개발용 PostgreSQL (localhost:5433)
```

## 실행 (맥, zsh)

### 백엔드 없이 화면만 보기

```zsh
cd ~/project/jjaklog/frontend
npm install
npm run dev:mock
```

http://localhost:5173 을 열면 된다. 브라우저 안의 가짜 서버가 대답하고, 새로고침하면 기록이 처음으로 돌아간다.
haru, bori, kongi 방에 미리 써 둔 일기가 있다.

### 백엔드까지 같이

```zsh
cd ~/project/jjaklog
docker compose up -d db

cd backend
./gradlew test        # 처음 한 번: 전체 흐름 테스트 (H2, Docker 필요 없음)
./gradlew bootRun     # http://localhost:8080

# 다른 터미널 탭에서
cd ~/project/jjaklog/frontend
npm run dev           # /api, /media 를 8080으로 넘겨줌
```

올린 사진은 `backend/storage/` 아래에 저장된다 (`STORAGE_DIR`로 바꿀 수 있음).

## 지금 들어간 것 (1단계)

- 개발용 로그인: 아이디만으로 들어감, 세션 쿠키. 카카오 로그인 전까지만 쓰고 운영에서는 `DEV_LOGIN_ENABLED=false`
- 앵무 등록과 수정: 6가지 종(사랑앵무, 모란앵무, 왕관앵무, 퀘이커, 그린칙코뉴어, 기타), 얼굴, 머리, 몸, 날개, 꼬리 색
- 일기: 사진 최대 10장. 브라우저에서 1600px JPEG로 줄인 뒤 올리고, 서버가 한 번 더 새 JPEG로 저장한다.
  두 번 다 메타데이터를 버려서 사진 속 GPS 위치가 남지 않는다.
- 피드 커서 페이지(무한 스크롤), 좋아요(한 사람 한 번), 댓글, 팔로우
- 방 조회 한 번에 액자, 체중, 기분, 통계, 연속 기록, 뱃지, 깃털을 모두 내려줌
- 깃털: 방마다 하루 한 번. DB 유니크 키(방, 방문자, 날짜)로 동시에 눌러도 한 번만 들어감
- 방명록

## 다음 단계 후보

- 카카오 로그인
- 사진 저장소를 로컬 디스크에서 Cloudflare R2 같은 오브젝트 스토리지로
- 체중 그래프, 알림, 해시태그
- 친구 방 실시간 같이 놀기 (WebSocket, 고해야지 realtime-server 경험 재사용)
- 앱 패키징 (PWA를 감싸서 스토어 출시)
