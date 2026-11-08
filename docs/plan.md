# 짹로그 기획 메모

## 한 줄

앵무 보호자가 매일 쓰는 일기(사진, 체중, 기분)가 쌓이면 내 앵무가 사는 3D 방이 채워지고, 다른 집 방에 놀러갈 수 있는 앵무판 미니홈피.

## 왜 인스타그램이 아니라 여기인가

1. 보호자가 실제로 매일 하는 기록(체중 g, 기분, 털갈이, 병원)을 일기와 같이 남길 수 있다.
2. 프로필이 3D 방이라, 기록이 쌓일수록 방이 바뀌는 재미가 있다. 인스타그램이 못 하는 부분.

## 원칙

- 방은 "일기가 눈에 보이는 모습"이다. 방 안 물건은 일기 데이터에서 나온다.
- 피드는 빠르게 훑어야 하므로 목록. 방은 프로필과 놀러가기에만 쓴다.
- 가구 자유 배치는 넣지 않는다. 정해진 자리(액자 칸, 선반 칸, 바닥)에 자동으로 채운다.
- 물건은 돈이 아니라 기록으로 얻는다.
- 체중은 "평소보다 줄었어요"까지만 보여주고, 아프다는 판단은 하지 않는다 (의료 조언 금지).
- 사진 위치 정보(EXIF GPS)는 반드시 지운다. 집 사진이 많은 서비스다.
- 로그인 없이도 공원에 들어가 손님 앵무(이름, 종, 색을 이 기기에 저장)로 놀고 다른 집에 들어갈 수 있다. 깃털, 방명록, 일기처럼 남는 기록만 로그인한다(스팸 방지).

## 공원 (놀러가기 탭)

- 집 12채가 공원 둘레에 선다. 앞자리는 내 집, 그다음 팔로우한 집, 최근 기록한 집 순. 빈 자리는 "빈 집터".
- 집 색은 그 집 첫 앵무의 몸과 머리 색. 오늘 일기를 쓴 집은 지붕 창에 불이 켜진다(postedToday).
- 공원의 다른 앵무는 실제 등록된 앵무를 AI로 움직인 것(나무 가지, 새 목욕통, 그네, 자기 집 문 앞 횃대). 사람이 적어도 공원이 비어 보이지 않게 하려는 것.
- 둥근 문을 누르면 그 집 방(/play/:handle)으로 들어가고, "← 공원"으로 나오면 그 집 문에서 나온다.
- 실시간으로 다른 사람의 앵무가 움직이는 것은 3단계.

## 대상 종 (처음)

사랑앵무, 모란앵무, 왕관앵무, 퀘이커, 그린칙코뉴어 + 기타.
종마다 3D 모양을 조금씩 다르게(왕관앵무 볏과 주황 볼, 사랑앵무 작은 몸).

## 단계

1. (지금) 웹: 일기 피드, 앵무 프로필, 액자와 방명록이 있는 내 방, 깃털 남기기, 공원과 다른 집 놀러가기(손님도 가능)
2. 연속 기록 보상 강화, 체중 그래프, 알림, 카카오 로그인, 사진 오브젝트 스토리지
3. 같은 방 실시간 같이 놀기(난장판, 같이 졸기), 앱 출시

## 데이터 (V1__init.sql)

users, parrots, posts(+post_images), post_likes, comments, follows, guestbook_entries, feathers

- posts.like_count, comment_count: 목록에서 매번 세지 않도록 미리 세어 둔 값. 증감은 UPDATE 한 줄로.
- feathers: UNIQUE(room_owner_id, visitor_id, visit_date) 로 하루 한 번을 DB가 보장.
- 날짜 경계(연속 기록, 깃털 하루 한 번)는 한국 시간 기준.

## API

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | /api/auth/dev-login | {handle, nickname} 개발용 로그인 |
| GET | /api/auth/me | 로그인한 사용자 (없으면 204) |
| POST | /api/auth/logout | |
| GET | /api/parrots/mine | 내 앵무 |
| POST | /api/parrots | 앵무 등록 |
| PUT | /api/parrots/{id} | 앵무 수정 |
| POST | /api/posts | multipart: images, body, parrotId, weightG, mood |
| GET | /api/posts/{id} | 일기 하나 |
| DELETE | /api/posts/{id} | 내 일기 지우기 |
| GET | /api/feed?tab=following\|latest&cursor= | 피드 |
| POST, DELETE | /api/posts/{id}/like | 좋아요 |
| GET, POST | /api/posts/{id}/comments | 댓글 |
| DELETE | /api/comments/{id} | 댓글 지우기 (작성자나 글쓴이) |
| POST, DELETE | /api/users/{handle}/follow | 팔로우 |
| GET | /api/rooms/{handle} | 방 전체 (액자, 오늘 기록, 통계, 관계, 뱃지, 깃털) |
| GET | /api/rooms/{handle}/posts?cursor= | 그 방의 일기 목록 |
| POST | /api/rooms/{handle}/feathers | 깃털 남기기 (하루 한 번, 내 방 불가) |
| GET, POST | /api/rooms/{handle}/guestbook | 방명록 |
| GET | /api/explore/rooms | 공원의 집 목록 (팔로우한 집 먼저, 그다음 최근 기록한 집, 최대 30, 오늘 일기 여부 포함). 로그인 없이도 된다 |
| GET | /api/explore/random?exclude= | 아무 방 하나 (없으면 204) |
| DELETE | /api/guestbook/{id} | 방명록 지우기 (작성자나 방 주인) |

에러는 `{code, message}` 형식이고 message는 그대로 화면에 보여줘도 되는 한국어다.
