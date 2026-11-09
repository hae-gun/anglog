# CLAUDE.md

앵로그: 앵무새가 되어 노는 가을 공원 앵파크(누구나, 로그인 없이)와, 앵집사가 쓰는 앵무 일기 SNS 앵로그.
앵파크가 사람을 데려오고, 앵집사를 앵로그로 이끈다. 일기가 쌓이면 3D 방과 앵파크의 집이 채워진다.
기획은 docs/plan.md, 실시간 규약은 docs/park-realtime.md. 코드 안 이름(패키지 com.jjaklog, DB jjaklog)은 아직 예전 이름.

## 구조

- backend/ : Spring Boot 3.3.5, Java 21, Gradle 8.10.2 래퍼, PostgreSQL + Flyway(db/migration), 테스트는 H2(PostgreSQL 모드)
  - 패키지: common(에러, 로그인 세션, 설정), user, parrot, post(이미지 저장 포함), social(좋아요, 댓글, 팔로우), room(방 조회, 방명록, 깃털)
  - 로그인: 아이디와 비밀번호(BCrypt, /api/auth/signup, /api/auth/login, 실패가 많으면 10분 막음). 세션 쿠키 JJAK_SESSION. 컨트롤러는 `@LoginUser Long userId`(없으면 401) / `@LoginUser(required = false)`
  - /api/auth/dev-login(아이디만으로 들어가기)은 개발과 테스트용. 운영(infra)에서는 DEV_LOGIN_ENABLED=false
  - JPA 엔티티는 연관관계 매핑 없이 id만 들고, 화면용 조합은 PostAssembler처럼 한 번에 모아서 조회
  - ddl-auto는 none, 스키마는 Flyway만 바꾼다. SQL은 PostgreSQL과 H2 둘 다 되는 문법만
- realtime/ : 앵파크 실시간 서버. 독립 Spring Boot 앱(com.anglog.realtime), 순수 WebSocket /ws, 메모리만, 포트 8090
  - 채널(공원 하나, 정원 50) 안의 변경을 200ms마다 한 번에 묶어 보냄. 고해야지 realtime-server의 방식만 가져왔고 그 서버에는 의존하지 않는다
  - 말은 정해진 문구 번호만(frontend/src/lib/phrases.ts와 angpark.phrase-count를 같이 바꿀 것). 이름과 모양은 LookRules가 조용히 고친다
- 운영: 화면은 GitHub Pages(anglog.nobody-asked.dev, .github/workflows/pages.yml, 404.html은 index.html 복사본). API와 실시간은 서버(api.anglog.nobody-asked.dev)
- infra/ : 서버 구성(docker-compose: db, api, realtime, web=안쪽 프록시 web.conf), 수동 배포 스크립트(anglog-deploy), 백업. 앞단 TLS는 고해야지 app 서버의 Nginx를 같이 쓴다. API는 CORS_ALLOWED_ORIGINS의 화면 주소만 쿠키와 함께 받는다. 순서와 주의는 infra/README.md
- frontend/ : Vite + React 18 + TS, react-router 6, three 0.128
  - src/api: types.ts(API 모양), http.ts(실서버. VITE_API_BASE가 있으면 그 주소로 credentials include, /media/ 주소도 앞에 붙임), mock.ts(가짜 서버, `npm run dev:mock`)
  - src/room3d: 3D 방과 앵무 모델 (plain JS). scene.js 방 꾸밈, room.js 프로필 방, play.js 방에서 놀기, park.js 앵파크(가을 공원. 3인칭은 걸으면 카메라가 등 뒤로 따라 돌고, 버튼으로 1인칭 전환)
  - src/lib/photoColors.ts: 앵무 색 고르기에서 사진(고르기, 붙여넣기, 끌어놓기)으로 종을 추정하고 부위별 색을 뽑는다. 이 기기에서만 색 계산(배경 지우기, Lab k-means, 색 조합으로 종 점수)하고 사진은 올리지 않는다. 그림 인식이 아니라 색 추론이라 결과는 추정으로 보여 준다
  - src/lib/parkNet.ts: 앵파크 실시간 클라이언트. VITE_REALTIME_URL이 없으면 dev에서는 ws://localhost:8090/ws, 가짜 서버 모드와 운영에서는 혼자 노는 모드
  - 첫 화면(/)은 누구에게나 앵파크(/park). 피드는 /feed. /park는 전체 화면 게임(헤더와 하단 메뉴 없음)
  - 3D 페이지는 lazy import (three.js를 열 때만 받음)

## 규칙

- 화면 글과 에러 메시지는 한국어. 가운뎃점 특수기호는 쓰지 않는다.
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
