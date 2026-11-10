# CLAUDE.md

앵로그: 앵무새가 되어 노는 가을 공원 앵파크(누구나, 로그인 없이)와, 앵집사가 쓰는 앵무 일기 SNS 앵로그.
앵파크가 사람을 데려오고, 앵집사를 앵로그로 이끈다. 일기가 쌓이면 3D 방과 앵파크의 집이 채워진다.
기획은 docs/plan.md, 실시간 규약은 docs/park-realtime.md. 코드 안 이름(패키지 com.jjaklog, DB jjaklog)은 아직 예전 이름.

## 구조

- backend/ : Spring Boot 3.3.5, Java 21, Gradle 8.10.2 래퍼, PostgreSQL + Flyway(db/migration), 테스트는 H2(PostgreSQL 모드)
  - 패키지: common(에러, 로그인 세션, 설정), user, parrot, post(이미지 저장 포함), social(좋아요, 댓글, 팔로우), room(방 조회, 방명록, 깃털), park(앵파크 토큰 발급), admin(관리자 페이지 API)
  - 로그인: 아이디와 비밀번호(BCrypt, /api/auth/signup, /api/auth/login, 실패가 많으면 10분 막음). 세션 쿠키 JJAK_SESSION. 컨트롤러는 `@LoginUser Long userId`(없으면 401) / `@LoginUser(required = false)`
  - /api/auth/dev-login(아이디만으로 들어가기)은 개발과 테스트용. 운영(infra)에서는 DEV_LOGIN_ENABLED=false
  - 관리자: ADMIN_HANDLES(쉼표)에 있는 아이디만 /api/admin/**(AdminGuard). /api/auth/me의 admin으로 화면이 링크를 보인다. 집사 정지(users.suspended_at)는 UserGate가 매 요청에서 막고 세션을 끊는다. 하루 활동(user_activity)도 UserGate가 하루 한 번 남긴다. 앵파크 현황과 내보내기는 실시간 서버 /internal/park(PARK_TOKEN_SECRET을 X-Admin-Key로)를 부른다
  - JPA 엔티티는 연관관계 매핑 없이 id만 들고, 화면용 조합은 PostAssembler처럼 한 번에 모아서 조회
  - ddl-auto는 none, 스키마는 Flyway만 바꾼다. SQL은 PostgreSQL과 H2 둘 다 되는 문법만
- realtime/ : 앵파크 실시간 서버. 독립 Spring Boot 앱(com.anglog.realtime), 순수 WebSocket /ws, 메모리만, 포트 8090
  - 채널(공원 하나, 정원 50) 안의 변경을 200ms마다 한 번에 묶어 보냄. 고해야지 realtime-server의 방식만 가져왔고 그 서버에는 의존하지 않는다
  - 말은 정해진 문구 번호만(frontend/src/lib/phrases.ts와 angpark.phrase-count를 같이 바꿀 것). 이름과 모양은 LookRules가 조용히 고친다
  - 로그인한 집사는 API가 서명한 앵파크 토큰(POST /api/park/token, PARK_TOKEN_SECRET 공유)을 hello에 싣는다. 계정당 앵무 한 마리: 다른 곳에서 들어오면 예전 연결은 4006으로 닫고 새 앵무가 그 자리에서 나온다. 마지막 자리는 30분 기억. home(집 링크)은 토큰이 맞을 때만. 규약 10장
  - 메타모아(metamoa.com) 목록: 실시간 서버 MetamoaLive가 접속자 수만 10분마다(METAMOA_KEY, METAMOA_SPACE_ID 없으면 꺼짐). 소식과 이벤트는 API admin/Metamoa를 거쳐 관리자 페이지에서. 신청과 캐릭터 올리기는 infra/scripts/metamoa.sh. 키는 infra/.env에만
  - /internal/park(현황, 내보내기 4007과 주소 막기)는 API 전용. 앞단 프록시는 /ws만 넘긴다. 오늘 숫자와 막은 주소는 ParkWatch 메모리에만
  - 장난치기(prank, answer, calm): 거리, 횟수, 무시 차단은 서버(Channel.prank, answer)가 판정하고, 밀려나기나 올라타기는 각자 자기 앵무만 움직인다. 규약 8장
- 운영: 화면은 GitHub Pages(anglog.nobody-asked.dev, .github/workflows/pages.yml, 404.html은 index.html 복사본). API와 실시간은 서버(api.anglog.nobody-asked.dev)
- infra/ : 서버 구성(docker-compose: db, api, realtime, web=안쪽 프록시 web.conf), 수동 배포 스크립트(anglog-deploy), 백업. 앞단 TLS는 고해야지 app 서버의 Nginx를 같이 쓴다. API는 CORS_ALLOWED_ORIGINS의 화면 주소만 쿠키와 함께 받는다. 순서와 주의는 infra/README.md
- frontend/ : Vite + React 18 + TS, react-router 6, three 0.128
  - src/api: types.ts(API 모양), http.ts(실서버. VITE_API_BASE가 있으면 그 주소로 credentials include, /media/ 주소도 앞에 붙임), mock.ts(가짜 서버, `npm run dev:mock`)
  - src/room3d: 3D 방과 앵무 모델 (plain JS). scene.js 방 꾸밈, room.js 프로필 방, play.js 방에서 놀기, park.js 앵파크(가을 공원과 강가 산책로. 앉을 곳은 모두 perchSegs, 걸을 수 있는 곳은 walkable, 물은 waterAt. 3인칭은 걸으면 카메라가 등 뒤로 따라 돌고, 버튼으로 1인칭 전환)
  - src/lib/photoColors.ts: 앵무 색 고르기에서 사진(고르기, 붙여넣기, 끌어놓기)으로 종을 추정하고 부위별 색을 뽑는다. 이 기기에서만 색 계산(배경 지우기, Lab k-means, 색 조합으로 종 점수)하고 사진은 올리지 않는다. 그림 인식이 아니라 색 추론이라 결과는 추정으로 보여 준다
  - src/lib/parkNet.ts: 앵파크 실시간 클라이언트. VITE_REALTIME_URL이 없으면 dev에서는 ws://localhost:8090/ws, 가짜 서버 모드와 운영에서는 혼자 노는 모드
  - 첫 화면(/)은 누구에게나 앵파크(/park). 피드는 /feed. /park는 전체 화면 게임(헤더와 하단 메뉴 없음)
  - 3D 페이지와 관리자 페이지(/admin, pages/Admin.tsx)는 lazy import
  - 가짜 서버 모드에서는 로그인한 누구나 관리자(관리 화면을 서버 없이 보려고)

## 규칙

- 화면은 한국어와 영어 둘 다(src/i18n.ts). 화면 글은 그 자리에서 tr('한국어', 'English')로 같이 적고, park.js와 play.js의 대사 목록은 L([...], [...]). 새 글을 넣을 때 영어도 같이 넣을 것. 일기, 댓글, 이름처럼 사람이 쓴 글은 번역하지 않는다. 관리자 페이지는 한국어만
- 서버 에러 메시지는 한국어로 오고, 영어 화면에서는 api/http.ts의 EN_ERRORS가 코드로 바꾼다. 새 에러 코드를 만들면 거기도 추가
- 앵파크 문구(lib/phrases.ts)는 번호만 오가므로 PHRASES와 PHRASES_EN 순서를 같이 맞춘다
- 가운뎃점 특수기호는 쓰지 않는다.
- 맥 터미널 명령은 zsh 기준으로 안내한다.
- 커밋 메시지에 Claude 세션 ID나 세션 주소 줄을 넣지 않는다.
- 사진은 브라우저와 서버 양쪽에서 새 JPEG로 다시 저장해 위치 정보를 지운다. 이 동작을 없애지 말 것.
- 체중 기록으로 건강 판단을 하지 않는다.
- 서버 IP, 비밀번호는 레포에 넣지 않는다(infra/.env, git 제외).
- 로그인 없이도 공원과 방에서 놀 수 있어야 한다(손님 앵무는 lib/guestBird.ts, 이 기기 localStorage). 깃털, 방명록, 일기처럼 남는 기록만 로그인.

## 실행

- 화면만: `cd frontend && npm run dev:mock`
- 전체: `docker compose up -d db` → `cd backend && ./gradlew bootRun` → `cd frontend && npm run dev`
- 앵파크 실시간: `cd realtime && ./gradlew bootRun` (8090)
- 테스트: `cd backend && ./gradlew test`, `cd realtime && ./gradlew test`, `cd frontend && npm run typecheck`
