# RAG 챗봇 API 가이드 (프론트엔드용)

## 공통
- Base URL: 예시 `http://localhost:3000`
- 요청/응답: JSON (SSE 스트림 제외)
- 인증: 환경변수 비밀번호를 매 요청 헤더로 전송
  - 관리자: `X-Admin-Password: <ADMIN_PASSWORD>`
  - 가맹점주: `X-User-Password: <USER_PASSWORD>`
- HTTPS 사용을 권장하며, 브라우저/프록시 로그에 비밀번호가 남지 않도록 주의.

## 엔드포인트

### 헬스체크
- `GET /healthz`
- 응답: `{ "ok": true }`

### 인증 확인
- `POST /api/auth/verify`
- Body: `{ "mode": "admin" | "user", "password": "string" }`
- 응답: `200 { ok: true, role: "admin" | "user" }` 또는 `401 { ok: false, message }`

### 관리자: 카테고리
- `GET /api/admin/categories`
  - 헤더: `X-Admin-Password`
  - 응답: `{ ok: true, data: Category[] }`
- `POST /api/admin/categories`
  - Body: `{ code, name, description?, sort_order? }`
- `PUT /api/admin/categories/:id`
  - Body: `{ name?, description?, sort_order?, is_active? }`
- `DELETE /api/admin/categories/:id`

### 관리자: 문서(규정)
- `GET /api/admin/articles`
  - 헤더: `X-Admin-Password`
  - Query(옵션): `category_id`, `is_published=true|false`, `page`, `page_size`
  - 응답: `{ ok: true, data: Article[], total: number }`
- `GET /api/admin/articles/:id`
- `POST /api/admin/articles`
  - Body:
    ```json
    {
      "category_id": 1,
      "title": "문서 제목",
      "content": "본문",
      "summary": "요약",
      "priority": 0,
      "requires_sm": false,
      "is_published": true
    }
    ```
  - 동작: 저장 후 청크 분할 + OpenAI 임베딩 생성 → `kb_chunk` 갱신
- `PUT /api/admin/articles/:id`
  - Body: `POST`와 동일 필드 (필수: `category_id`, `title`, `content`)
  - 동작: 기존 청크 삭제 후 재생성
- `DELETE /api/admin/articles/:id`

### 관리자: 프리뷰
- `POST /api/admin/preview-chat`
  - 헤더: `X-Admin-Password`
  - Body: `{ "question": "가맹점주 질문 예시" }`
  - 응답: `{ ok: true, answer, fallback_to_sm, references, used_chunks }`
  - 목적: 관리자 화면에서 RAG+LLM 응답을 미리보기

### 가맹점주: 비스트리밍 챗
- `POST /api/user/chat`
  - 헤더: `X-User-Password`
  - Body: `{ "question": "질문 내용" }`
  - 응답: `{ ok: true, answer, fallback_to_sm, references }`

### 가맹점주: SSE 스트리밍 챗
- `POST /api/user/chat/stream`
  - 헤더: `X-User-Password`, `Content-Type: application/json`
  - Body: `{ "question": "질문 내용" }`
  - 응답: `Content-Type: text/event-stream`
  - 이벤트 포맷 예시:
    ```
    event: meta
    data: {"fallback_to_sm":false,"references":[...]}

    event: chunk
    data: {"text":"첫 부분..."}

    event: chunk
    data: {"text":"다음 부분..."}

    event: end
    data: {}
    ```
  - 에러 시: HTTP 4xx/5xx 또는 `event: error` + 메시지 후 종료

## 필드 설명 (요약)
- Category: `{ id, code, name, description, sort_order, is_active }`
- Article: `{ id, category_id, title, content, summary, priority, requires_sm, is_published }`
- references: `[{ article_id, category_code }]`
- used_chunks: 관리자 프리뷰용, 응답 생성에 사용된 청크 목록

## 프론트 가이드
- 모든 요청에 HTTPS 사용, 비밀번호는 로컬/세션에 오래 저장하지 않고 필요 시 재입력 받는 UX 권장.
- SSE는 `fetch` 스트림을 직접 파싱하거나, EventSource 호환 래퍼를 사용(POST+SSE이므로 기본 EventSource는 사용 불가).
- 질문이 길거나 멀티라인이어도 POST body로 전달하므로 쿼리스트링 제한 없음.
