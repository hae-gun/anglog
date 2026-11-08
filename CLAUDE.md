# CLAUDE.md

짹로그: 앵무 일기 SNS. 일기(사진, 체중, 기분)가 쌓이면 3D 방(프로필)이 채워진다. 기획은 docs/plan.md.

## 구조

- backend/ : Spring Boot 3.3.5, Java 21, Gradle 8.10.2 래퍼, PostgreSQL + Flyway(db/migration), 테스트는 H2(PostgreSQL 모드)
  - 패키지: common(에러, 로그인 세션, 설정), user, parrot, post(이미지 저장 포함), social(좋아요, 댓글, 팔로우), room(방 조회, 방명록, 깃털)
  - 로그인: 세션 쿠키 JJAK_SESSION. 컨트롤러는 `@LoginUser Long userId`(없으면 401) / `@LoginUser(required = false)`
  - JPA 엔티티는 연관관계 매핑 없이 id만 들고, 화면용 조합은 PostAssembler처럼 한 번에 모아서 조회
  - ddl-auto는 none, 스키마는 Flyway만 바꾼다. SQL은 PostgreSQL과 H2 둘 다 되는 문법만
- frontend/ : Vite + React 18 + TS, react-router 6, three 0.128
  - src/api: types.ts(API 모양), http.ts(실서버), mock.ts(가짜 서버, `npm run dev:mock`)
  - src/room3d: 3D 방과 앵무 모델 (plain JS). scene.js 방 꾸밈, room.js 프로필 방, play.js 방에서 놀기, park.js 공원
  - 방 페이지는 lazy import (three.js를 방 열 때만 받음)

## 규칙

- 화면 글과 에러 메시지는 한국어. 가운뎃점 특수기호는 쓰지 않는다.
- 맥 터미널 명령은 zsh 기준으로 안내한다.
- 커밋 메시지에 Claude 세션 ID나 세션 주소 줄을 넣지 않는다.
- 사진은 브라우저와 서버 양쪽에서 새 JPEG로 다시 저장해 위치 정보를 지운다. 이 동작을 없애지 말 것.
- 체중 기록으로 건강 판단을 하지 않는다.
- 로그인 없이도 공원과 방에서 놀 수 있어야 한다(손님 앵무는 lib/guestBird.ts, 이 기기 localStorage). 깃털, 방명록, 일기처럼 남는 기록만 로그인.

## 실행

- 화면만: `cd frontend && npm run dev:mock`
- 전체: `docker compose up -d db` → `cd backend && ./gradlew bootRun` → `cd frontend && npm run dev`
- 테스트: `cd backend && ./gradlew test`, `cd frontend && npm run typecheck`
