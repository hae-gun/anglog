# 앵로그 (anglog)

앵무새가 되어 노는 가을 공원 **앵파크**, 그리고 우리 앵무의 하루를 기록하는 일기 SNS **앵로그**.
누구나 로그인 없이 앵파크에서 먼저 놀고, 앵무를 키우는 사람(앵집사)은 앵로그에 우리 앵무를 등록해
앵파크에 집을 짓고 일기를 쓴다. 웹(PWA)으로 먼저 반응을 보고 앱으로 낼 계획이다.

(코드 안의 패키지명과 DB명은 아직 예전 이름 jjaklog다. 따로 바꿀 예정.)

## 앵파크

- 가운데 거대한 나무(가지마다 앉을 수 있음), 키 큰 단풍나무 숲, 은행나무 길, 낙엽 더미, 연못, 그네, 새 목욕통, 횟대 놀이대가 있는 가을 공원
- 공원 밖으로 이어지는 강가 산책로. 연못 가장자리, 시냇물, 강가 모래밭에 들어가서 물장난을 친다
- 나무 가지와 꼭대기에 올라가 쉴 수 있다
- 3인칭 시점: 화면을 끌면 카메라가 돌고, 두 손가락이나 휠로 가까이/멀리
- 조이스틱(또는 WASD, 방향키)으로 걷고, 날기 버튼(또는 스페이스)으로 날아오른다. 바닥이나 나무 가지를 누르면 그쪽으로 간다
- 공원 둘레에 앵집사들의 집 12채. 둥근 문을 누르면 그 집 3D 방으로 들어가 그 집 앵무와 논다
- 오늘 일기를 쓴 집은 지붕 창에 불이 켜진다
- 등록된 앵무들은 공원에서 혼자 돌아다니고(AI), 지금 접속한 사람들의 앵무는 실시간으로 보인다
- 말은 정해진 문구만 (자유 채팅 없음). 짹짹, 같이 놀기(춤)
- 로그인 없이 내 앵무를 꾸밀 수 있고(이 기기에 저장), 앵로그에 등록할 때 그 모습을 그대로 가져간다

## 앵로그

- 일기: 사진 여러 장, 글, 그리고 선택 기록(체중 g, 기분)
- 피드: 팔로잉 / 최신, 좋아요, 댓글
- 내 방(3D): 벽 액자 = 사진 일기, 체중계, 선반 기념품, 놀러온 사람의 깃털, 방명록

## 폴더

```
backend/    앵로그 API. Spring Boot 3.3.5, Java 21, PostgreSQL + Flyway (테스트는 H2)
realtime/   앵파크 실시간 서버. 독립 Spring Boot 앱, WebSocket, 메모리만 사용 (포트 8090)
frontend/   Vite + React + TypeScript, three.js 0.128
docs/       plan.md 기획과 API, park-realtime.md 실시간 규약
docker-compose.yml  개발용 PostgreSQL (localhost:5433)
```

## 실행 (맥, zsh)

### 서버 없이 화면만 보기

```zsh
cd ~/project/jjaklog/frontend
npm install
npm run dev:mock
```

http://localhost:5173 을 열면 앵파크부터 시작한다(피드는 /feed). 브라우저 안의 가짜 서버가 대답하고, 새로고침하면 기록이 처음으로 돌아간다. 미리 있는 계정 haru, bori, kongi의 비밀번호는 parrot123.
이 모드에서는 실시간 서버에 붙지 않는다(혼자 노는 앵파크).

### 전부 같이

```zsh
cd ~/project/jjaklog
docker compose up -d db

cd backend
./gradlew test        # 전체 흐름 테스트 (H2, Docker 필요 없음)
./gradlew bootRun     # 앵로그 API, http://localhost:8080

# 새 터미널 탭
cd ~/project/jjaklog/realtime
./gradlew test        # 두 앵무가 서로 보이는지 실제 WebSocket으로 확인
./gradlew bootRun     # 앵파크 실시간, ws://localhost:8090/ws

# 새 터미널 탭
cd ~/project/jjaklog/frontend
npm run dev           # /api, /media 는 8080으로, 앵파크는 8090으로 붙는다
```

브라우저 창을 두 개 열어 앵파크에 들어가면 서로의 앵무가 보인다.
올린 사진은 `backend/storage/` 아래에 저장된다 (`STORAGE_DIR`로 바꿀 수 있음).

### 운영에서 실시간 서버 주소

프론트 빌드 때 `VITE_REALTIME_URL=wss://.../ws` 를 준다. 없으면 운영 빌드의 앵파크는 혼자 노는 모드로 뜬다.
실시간 서버에는 `ANGPARK_ALLOWED_ORIGINS`(프론트 주소)와, 필요하면 `ANGPARK_BLOCKED_WORDS_FILE`(이름 금칙어, git에 넣지 않음)을 준다.

## 운영 배포

화면은 https://anglog.nobody-asked.dev (GitHub Pages, main에 `frontend/`가 바뀌면 Actions가 배포), API와 앵파크 실시간은 서버의 https://api.anglog.nobody-asked.dev . 구성, 처음 설정 순서, 서버 배포(`anglog-deploy`), 백업은 [infra/README.md](infra/README.md).

## 다음 단계 후보

- 앵파크: 홈 아이디 확인 토큰, 이름 신고, 서버 여러 대(Redis), 부하 시험
- 카카오 로그인, 사진 저장소를 오브젝트 스토리지로
- 체중 그래프, 알림
- 앱 패키징 (PWA를 감싸서 스토어 출시)
