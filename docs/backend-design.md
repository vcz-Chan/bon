# 가맹점주 운영 매뉴얼 RAG 챗봇 백엔드 설계서 (MVP)

본 문서는 다음 요구사항을 기준으로 백엔드(Typescript, Express.js, Postgres + pgvector) 설계를 정의한다.  
프론트엔드는 본 문서의 API 규격을 사용하여 별도로 구현하는 것을 전제로 한다.

---

## 1. 시스템 개요

- **목적**
  - 가맹점주가 매장 운영 중 발생하는 질문을, 본사 운영 규정 기반으로 즉시 확인할 수 있는 RAG 기반 챗봇을 제공한다.
  - 규정 준수, 운영 일관성, 본사 문의(콜/카톡 등) 부담을 감소시키는 것이 1차 목표이다.

- **주요 기능**
  - 관리자(Admin)용 운영 규정 지식 CRUD (카테고리/문서/청크+임베딩 관리)
  - 가맹점주(User)를 위한 단일 챗봇 질의/응답 API
  - 규정 기반 RAG 검색 및 정책 기반 응답 생성
  - 환경변수 기반 비밀번호로 역할 전환 (계정 시스템 없음)

- **비범위(Out of Scope, MVP 기준)**
  - 회원가입/로그인, JWT 기반 계정 시스템
  - 다국어 지원
  - 대규모 트래픽/멀티 테넌시
  - 고급 모니터링/대시보드
  - 테스트 코드 (사용자 요청: **테스트 코드는 작성하지 않는다**)

---

## 2. 기술 스택 및 인프라

- **런타임 및 언어**
  - Node.js (LTS, 예: 20.x)
  - TypeScript

- **웹 프레임워크**
  - Express.js

- **데이터베이스**
  - PostgreSQL
  - `pgvector` 확장 사용
    - 임베딩 저장용 `vector(N)` 타입 컬럼 사용

- **DB 접근**
  - `pg` (node-postgres) 기반의 직접 SQL 접근
    - 단순 스키마 + 성능 제어를 위해 ORM 대신 SQL 위주의 설계
    - 서비스 레이어에서 쿼리 빌더/리포지토리 패턴으로 캡슐화

- **LLM & 임베딩 (OpenAI 전용)**
  - LLM/임베딩은 **OpenAI만 사용**한다.
  - 모델은 gpt-5 계열(또는 그에 준하는 최신 gpt 계열)을 사용하며, 실제 모델명은 환경변수로 주입한다.
  - 임베딩도 OpenAI 임베딩 모델(예: `text-embedding-3-large`)만 사용한다.
  - 백엔드는 다음과 같이 추상화된 인터페이스만 가진다.
    - `EmbeddingsProvider`
      - `embedText(text: string): Promise<number[]>`
      - `embedMany(texts: string[]): Promise<number[][]>`
    - `LlmProvider`
      - `generateAnswer(params: { question: string; contextChunks: RagChunk[]; policyPrompt: string }): Promise<string>`
      - (선택) `streamAnswer?(params: { question: string; contextChunks: RagChunk[]; policyPrompt: string }): AsyncIterable<string>`
        - 스트리밍 응답을 위한 메서드
        - 상위 레이어(Express 컨트롤러)에서는 이 AsyncIterable을 사용해 **SSE(Server-Sent Events)**로 클라이언트에 전송

- **구동 환경**
  - 환경변수 기반 설정 (`.env`)
  - 도커 사용 여부는 추후 결정 (v1 문서에서는 필수 요구 아님)

---

## 3. 아키텍처 개요

### 3.1 계층 구조

- **Express HTTP API 레이어**
  - 라우팅, 요청/응답 처리, 간단한 유효성 검사
  - 역할 검증(관리자/가맹점주) 미들웨어

- **서비스 레이어**
  - 도메인 로직 구현
  - 예:
    - `CategoryService`
    - `ArticleService`
    - `ChunkService` (또는 ArticleService 내부에서 청크/임베딩 처리)
    - `ChatService` (RAG 파이프라인)
    - `AuthService` (환경변수 기반 비밀번호 검증)

- **리포지토리/DB 레이어**
  - Postgres 쿼리 캡슐화
  - 각 테이블별 리포지토리
    - `KbCategoryRepository`
    - `KbArticleRepository`
    - `KbChunkRepository`

- **인프라 레이어**
  - Postgres 클라이언트
  - LLM/임베딩 클라이언트
  - 설정/환경값 로딩
  - 로깅

### 3.2 역할 및 인증/인가

- **역할**
  - `ADMIN` (관리자): 카테고리/문서/지식 관리 + 테스트 질문 프리뷰
  - `USER` (가맹점주): 챗봇 질의만 가능

- **인증 방식**
  - 계정/회원 시스템 없음
  - 환경변수 기반 비밀번호:
    - `ADMIN_PASSWORD`
    - `USER_PASSWORD` (선택적, 필요시만 사용)
  - 실사용 패턴:
    - 클라이언트는 로그인 화면에서 비밀번호를 입력
    - 백엔드의 `/api/auth/verify` 엔드포인트로 역할+비밀번호 전송
    - 검증 성공 시, 프론트엔드는
      - (MVP 간단안) 이후 호출마다 `X-Admin-Password` 또는 `X-User-Password` 헤더로 비밀번호를 그대로 전달  
      - 또는 (확장안) 메모리 세션 토큰/JWT를 발급할 수 있으나, MVP 단계에서는 비밀번호 헤더 전송 방식으로 단순화

- **인가 방식**
  - 미들웨어에서 헤더 또는 요청 바디의 비밀번호를 읽어 환경값과 비교
  - 실패 시 HTTP 401/403 응답

---

## 4. 데이터 모델 (RAG 지식 구조)

### 4.1 공통 개념

- **카테고리(kb_category)** → **문서(kb_article)** → **청크(kb_chunk)** 구조
- 문서는 규정 단위(제목 + 내용)
- 청크는 문단 또는 의미 단위로 분할된 텍스트 조각
- 임베딩은 청크 단위로 생성 및 저장

### 4.2 테이블 설계

#### 4.2.1 `kb_category`

- **의미**: 운영 규정의 상위 분류 (예: SM 문의 필요 항목, 메뉴 보관 방법 등)
- **초기 데이터(예시)**:
  - `SM 문의 필요 항목`
  - `메뉴 보관 방법`
  - `포장 규정`
  - `염도 조절 규정`
  - `발주 팁`
  - `추가 문의/요청 처리`

- **컬럼 설계**
  - `id` (PK, bigint / serial)
  - `code` (varchar, unique)
    - 예: `NEED_SM`, `STORAGE`, `TAKEOUT`, `SALINITY`, `ORDER_TIPS`, `CUSTOM_REQUEST`
  - `name` (varchar)
    - 한글 명칭 (예: `SM 문의 필요 항목`)
  - `description` (text, nullable)
  - `sort_order` (int, default 0)
  - `is_active` (boolean, default true)
  - `created_at` (timestamptz, default now)
  - `updated_at` (timestamptz, default now, trigger로 자동 업데이트)

#### 4.2.2 `kb_article`

- **의미**: 규정 단위 문서
  - 제목 + 본문 내용 + 카테고리
  - 공개 여부, 우선순위, SM 문의 필요 여부 등 메타데이터 포함

- **컬럼 설계**
  - `id` (PK)
  - `category_id` (FK → `kb_category.id`)
  - `title` (varchar, not null)
  - `content` (text, not null)
  - `summary` (text, nullable)
    - LLM 또는 사람이 요약한 문서 요약
  - `priority` (int, default 0)
    - 검색 시 정렬/가중치에 사용할 수 있는 우선순위
  - `requires_sm` (boolean, default false)
    - 문서 내용이 "반드시 SM 문의"가 필요한 영역인지 표시
  - `is_published` (boolean, default true)
    - 가맹점주 RAG 검색 대상으로 포함 여부
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

#### 4.2.3 `kb_chunk`

- **의미**: 문서를 문단/의미단위로 분리한 청크 + 임베딩

- **컬럼 설계**
  - `id` (PK)
  - `article_id` (FK → `kb_article.id`, on delete cascade)
  - `content` (text, not null)
  - `embedding` (`vector(N)`, not null)
    - N: 환경 변수/설정으로 관리 (예: 1536)
  - `chunk_index` (int, not null)
    - 문서 내에서 청크 순서
  - `category_code` (varchar, not null)
    - 조인 없이 카테고리 필터링을 빠르게 하기 위해 `kb_category.code`를 복제 저장
  - `created_at` (timestamptz)

#### 4.2.4 향후 확장 가능성

- `kb_chunk`에 `metadata` (`jsonb`) 컬럼 추가 가능
  - 예: { "source": "manual_v1", "section": "3.1", "tags": ["포장", "배달"] }
- `kb_article`에 버전 관리 컬럼 추가 가능 (예: `version`, `is_latest`)

---

## 5. pgvector 및 검색 전략

### 5.1 pgvector 설정

- Postgres에 `pgvector` 확장 설치:
  - `CREATE EXTENSION IF NOT EXISTS vector;`
- `kb_chunk.embedding` 컬럼 타입:
  - `vector(N)` (예: `vector(1536)`)

### 5.2 유사도 검색 쿼리 예시

- 코사인 거리 기준 검색 예:
  - `ORDER BY embedding <=> $1 LIMIT $k`
  - `$1`: 질의 임베딩 (vector)

- 필터 + 검색:
  - 카테고리/출시여부 등으로 필터링 후 유사도 정렬
  - 예시 조건:
    - `kb_article.is_published = true`
    - 필요시 `category_code IN (...)`

---

## 6. 챗봇 처리 흐름 (RAG 파이프라인)

### 6.1 관리자용 데이터 입력/수정 플로우

1. **관리자가 문서 생성/수정 요청**
   - `POST /api/admin/articles`
   - `PUT /api/admin/articles/:id`
2. **문서 저장**
   - 트랜잭션 내에서 `kb_article` 삽입/수정
3. **청크 분할**
   - 문단 기준(\n\n) 또는 규칙 기반으로 `content`를 여러 청크로 분리
   - 각 청크에 `chunk_index` 부여
4. **임베딩 생성**
   - `EmbeddingsProvider.embedMany(chunks)`
   - 외부 API 호출 실패 시 전체 트랜잭션 롤백 또는 재시도 전략
5. **`kb_chunk` 저장**
   - 기존 청크 제거 후 새 청크 일괄 삽입 (업데이트 시)
   - `article_id`, `content`, `embedding`, `chunk_index`, `category_code` 저장

### 6.2 가맹점주 질의 플로우

1. **질문 입력**
   - 프론트엔드에서 `POST /api/user/chat` 호출
   - 바디: `{ "question": "...", "metadata": { ... } }` (metadata는 선택)
2. **질문 임베딩 생성**
   - `EmbeddingsProvider.embedText(question)`
3. **Vector 검색**
   - `kb_chunk`에서 유사도 검색
   - 필터 조건 예:
     - `kb_article.is_published = true`
   - 상위 N개 (예: 5~10개) 청크를 검색
   - 상위 N(`RAG_TOP_K`)과 최소 유사도 임계값(`RAG_MIN_SCORE`)은 환경변수로 관리
4. **비즈니스 규칙/정책 적용을 위한 컨텍스트 구성**
   - 검색된 청크 + 각 청크의 문서 메타 정보(`requires_sm`, `category_code`, `priority` 등)를 함께 전달
5. **정책 프롬프트 + 검색 결과를 LLM에 전달**
   - 시스템 프롬프트에 다음 정책을 명시:
     1. 규정을 최우선으로 적용하여 답변.
     2. 규정이 없거나 모호한 경우:  
        → “담당 sm에게 문의 부탁드립니다.” 안내 후 일반 원칙 1줄 제공.
     3. 규정과 요청이 충돌하는 경우:  
        → “규정상 불가합니다.”라고 명확히 답변.
     4. 매출·레시피 등 민감 영역:  
        → 상세 제공 없이 문의 절차 안내.
6. **응답 생성**
   - LLM으로부터 규정 기반 답변 수신
7. **규정 없음/검색 미흡 처리**
   - 검색된 청크가 너무 적거나(예: 유사도/점수 기준), `requires_sm`가 강하게 표시된 경우:
     - 정책에 따라 “담당 sm에게 문의 부탁드립니다.” 메시지 강조
    - 임계값 판단 로직은 환경변수(`RAG_MIN_SCORE`) 기반으로 중앙집중 관리
8. **최종 응답 반환**
   - 프론트엔드로 답변 텍스트 + 선택적으로 참조된 카테고리/문서 정보 반환 가능

---

## 7. API 설계 (초안)

### 7.1 인증/역할 확인

- `POST /api/auth/verify`
  - 설명: 입력한 비밀번호가 어떤 역할(Admin/User)에 해당하는지 검증
  - 요청 바디:
    ```json
    {
      "mode": "admin", // 또는 "user"
      "password": "string"
    }
    ```
  - 응답:
    - 200 OK: `{ "ok": true, "role": "admin" | "user" }`
    - 401 Unauthorized: `{ "ok": false, "message": "invalid password" }`

- 이후 요청 인증 방식 (MVP 단순안):
  - 관리자는 모든 `/api/admin/*` 요청에 `X-Admin-Password: <입력 비밀번호>` 헤더를 포함
  - 가맹점주는 `/api/user/*` 요청에 `X-User-Password: <입력 비밀번호>` 헤더를 포함 (사용 시)

### 7.2 관리자 – 카테고리 관리

- `GET /api/admin/categories`
  - 설명: 카테고리 목록 조회
  - 응답: `[ { id, code, name, description, sort_order, is_active } ]`

- `POST /api/admin/categories`
  - 설명: 카테고리 생성
  - 요청 바디: `{ code, name, description?, sort_order? }`

- `PUT /api/admin/categories/:id`
  - 설명: 카테고리 수정
  - 요청 바디: `{ name?, description?, sort_order?, is_active? }`

- `DELETE /api/admin/categories/:id`
  - 설명: 카테고리 삭제 (논리 삭제 또는 물리 삭제 중 정책 선택)

### 7.3 관리자 – 문서 관리 (RAG 지식)

- `GET /api/admin/articles`
  - 설명: 문서 목록 조회 (필터/페이징 지원)
  - 쿼리 파라미터 예: `category_id`, `is_published`, `page`, `page_size`

- `GET /api/admin/articles/:id`
  - 설명: 문서 상세 조회 (본문 포함)

- `POST /api/admin/articles`
  - 설명: 문서 생성 + 청크/임베딩 자동 생성
  - 요청 바디:
    ```json
    {
      "category_id": 1,
      "title": "문서 제목",
      "content": "문서 전체 내용",
      "summary": "요약 (선택)",
      "priority": 0,
      "requires_sm": false,
      "is_published": true
    }
    ```
  - 동작:
    - 트랜잭션 내에서:
      1. `kb_article` 생성
      2. `content`를 청크 단위로 분할
      3. 임베딩 생성
      4. `kb_chunk` 일괄 삽입

- `PUT /api/admin/articles/:id`
  - 설명: 문서 수정 + 청크/임베딩 재생성
  - 요청 바디: `POST`와 동일 구조 (부분 수정 가능)
  - 동작:
    - 트랜잭션 내에서:
      1. `kb_article` 업데이트
      2. 기존 `kb_chunk` 삭제
      3. 새로운 청크 분할 + 임베딩 생성
      4. `kb_chunk` 재삽입

- `DELETE /api/admin/articles/:id`
  - 설명: 문서 삭제
  - 동작:
    - `kb_article` 삭제 시 FK `ON DELETE CASCADE`에 따라 `kb_chunk` 자동 삭제

### 7.4 관리자 – 테스트 질문 프리뷰

- `POST /api/admin/preview-chat`
  - 설명: 관리자 화면에서 특정 질문에 대해 RAG 기반 응답을 미리보기
  - 요청 바디:
    ```json
    {
      "question": "가맹점주 질문 예시",
      "options": {
        "top_k": 5,
        "category_codes": ["STORAGE"]
      }
    }
    ```
  - 응답:
    ```json
    {
      "answer": "LLM이 생성한 답변",
      "used_chunks": [
        {
          "chunk_id": 1,
          "article_id": 10,
          "category_code": "STORAGE",
          "content": "청크 텍스트 일부..."
        }
      ]
    }
    ```

### 7.5 가맹점주 – 챗봇 질의

- `POST /api/user/chat`
  - 설명: 가맹점주 질문 → 규정 기반 **비스트리밍** 응답
  - 요청 바디:
    ```json
    {
      "question": "질문 내용",
      "metadata": {
        "store_id": "optional",
        "channel": "web"
      }
    }
    ```
  - 응답:
    ```json
    {
      "answer": "최종 응답 텍스트",
      "fallback_to_sm": false,
      "references": [
        {
          "article_id": 10,
          "title": "관련 규정 제목",
          "category_code": "STORAGE"
        }
      ]
    }
    ```
  - 규정 없음/검색 미흡 시:
    - `answer`에 “담당 sm에게 문의 부탁드립니다.”가 반드시 포함되도록 ChatService/프롬프트에서 제어
    - `fallback_to_sm: true` 플래그를 통해 클라이언트가 UI에서 강조 가능

### 7.6 가맹점주 – SSE 스트리밍 챗 응답

- `POST /api/user/chat/stream`
  - 설명: 가맹점주 질문 → 규정 기반 **스트리밍(SSE)** 응답
  - 사용 예 (브라우저):
    - EventSource는 GET만 지원하므로, **POST + SSE 응답**은 `fetch` 스트림을 직접 읽는 방식으로 처리:
      ```js
      const res = await fetch("/api/user/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Password": "..." },
        body: JSON.stringify({ question: "..." })
      });
      const reader = res.body.getReader();
      // reader.read() 루프로 text/event-stream 파싱
      ```
    - 서버는 POST를 받고 바로 `Content-Type: text/event-stream`으로 응답을 시작한다. (Express: `app.post` 핸들러 내 `res.write(...)`)
  - 요청:
    - 메서드: `POST`
    - 바디(JSON):
      ```json
      {
        "question": "질문 내용",
        "metadata": {
          "store_id": "optional",
          "channel": "web"
        }
      }
      ```
    - 헤더:
      - 필요 시 `X-User-Password` 헤더로 권한 검증 (비스트리밍과 동일 정책)
      - `Content-Type: application/json`
  - 응답:
    - HTTP 헤더:
      - `Content-Type: text/event-stream`
      - `Cache-Control: no-cache`
      - `Connection: keep-alive`
    - 바디:
      - SSE 베스트 프랙티스 포맷 (이벤트 타입 + data):
        ```text
        event: chunk
        data: {"text":"첫 부분..."}

        event: chunk
        data: {"text":"다음 부분..."}

        event: meta
        data: {"fallback_to_sm":true,"references":[...]}

        event: end
        data: {}
        ```
      - 에러/권한 오류:
        - HTTP 4xx/5xx로 즉시 종료하거나,
        - 가능하면
          ```text
          event: error
          data: {"message":"unauthorized"}
          ```
          전송 후 연결 종료
  - 서버 측 흐름:
    1. `question`을 받아 EmbeddingsProvider로 임베딩 생성 → RAG 검색 수행
    2. LLM 정책 프롬프트 + 컨텍스트 청크를 구성
    3. `LlmProvider.streamAnswer(...)`를 호출해 AsyncIterable을 얻는다.
    4. 각 토큰/청크를 SSE 이벤트로 클라이언트에 순차 전송
    5. 스트림 종료 시 `type: "end"` 이벤트 전송
  - 규정 없음/검색 미흡 시:
    - 스트림 마지막 부분 또는 서버 판단 시점에 “담당 sm에게 문의 부탁드립니다.” 내용을 반드시 포함하여 전송
    - 필요 시 `type: "meta"` 이벤트로 `fallback_to_sm: true`를 별도 전송 가능

---

## 8. 운영 규정 기반 응답 정책 구현

### 8.1 정책 요약

1. 규정을 최우선으로 적용하여 답변한다.
2. 규정이 없거나 모호한 경우  
   → “담당 sm에게 문의 부탁드립니다.” 안내 후 일반 원칙 1줄 제공.
3. 규정과 요청이 충돌하는 경우  
   → “규정상 불가합니다.”라고 명확히 답변.
4. 매출·레시피 등 민감 영역  
   → 상세 제공 없이 문의 절차 안내.

### 8.2 구현 포인트

- **프롬프트 설계**
  - 시스템 프롬프트에 위 4가지 규칙을 명시하고, 제공된 청크/문서를 "규정"으로 간주하도록 지시
  - 청크에 `requires_sm`가 포함된 경우, 해당 내용이 있으면 반드시 SM 문의를 안내하도록 명시

- **서버 로직 보조**
  - 검색 결과가 거의 없거나, 임계 유사도 미만일 때:
    - LLM 호출 전에 "규정 없음" 상황을 명시하는 추가 정보를 프롬프트에 포함
  - 민감 영역(예: 특정 카테고리 코드)일 경우:
    - 프롬프트에 상세 수치를 절대 제공하지 않도록 강조

---

## 9. 환경변수 및 설정

- **필수 환경변수**
  - `PORT` – 서버 포트 (예: 3000)
  - `NODE_ENV` – `development` | `production`
  - `DATABASE_URL` – Postgres 연결 문자열
  - `ADMIN_PASSWORD`
  - `USER_PASSWORD` (선택, 필요 시 적용)
  - `EMBEDDING_DIM` – pgvector 차원 수 (예: 1536)
  - `OPENAI_API_KEY` – OpenAI API 키
  - `OPENAI_BASE_URL` – 선택, 프록시/전용 엔드포인트 사용 시
  - `LLM_MODEL` – 예: `gpt-5.1`, `gpt-4.1` 등 (gpt-5 계열 우선 사용)
  - `EMBEDDING_MODEL` – 예: `text-embedding-3-small` (소형 임베딩 우선)

- **기타 설정**
  - RAG 검색 시 상위 N 개: `RAG_TOP_K` (예: 5~10) – 환경변수로 관리
  - 임계 유사도/점수: `RAG_MIN_SCORE` (예: 0.75~0.85) – 환경변수로 관리

---

## 10. 폴더 구조 (백엔드)

MVP 구현 시 권장 폴더 구조 예시는 아래와 같다.

```text
src/
  app.ts              // Express 앱 초기화
  server.ts           // 서버 실행 엔트리포인트

  config/
    env.ts            // 환경변수 로딩/검증
    db.ts             // Postgres 클라이언트 초기화

  modules/
    auth/
      auth.controller.ts
      auth.service.ts

    categories/
      category.controller.ts
      category.service.ts
      category.repository.ts

    articles/
      article.controller.ts
      article.service.ts
      article.repository.ts

    chunks/
      chunk.repository.ts   // 필요 시 별도 관리

    chat/
      chat.controller.ts
      chat.service.ts

  infra/
    llm/
      embeddings.provider.ts
      llm.provider.ts

  middleware/
    auth.middleware.ts      // 헤더 기반 관리자/유저 인증
    error.middleware.ts     // 에러 핸들링
```

---

## 11. 개발 단계 계획 (MVP)

1. **프로젝트 부트스트랩**
   - TypeScript + Express 기본 셋업
   - 환경변수 로딩 (`dotenv` 등)
   - 기본 헬스체크 엔드포인트

2. **DB 스키마 및 마이그레이션**
   - `kb_category`, `kb_article`, `kb_chunk` 테이블 생성
   - `pgvector` 확장 적용 및 `embedding` 컬럼 추가

3. **인증/역할 미들웨어 구현**
   - `POST /api/auth/verify`
   - `X-Admin-Password`, `X-User-Password` 기반 권한 체크

4. **카테고리/문서 관리 기능 구현**
   - 관리자용 카테고리 CRUD
   - 관리자용 문서 CRUD + 청크 분할 + 임베딩 생성 로직

5. **RAG 검색 및 챗봇 API 구현**
   - `POST /api/user/chat`
   - `POST /api/admin/preview-chat`
   - RAG 파이프라인 및 정책 프롬프트 적용

6. **운영 및 설정 정리**
   - 기본 로깅 및 에러 핸들링
   - 환경변수 템플릿(`.env.example`) 추가

> 주의: 사용자의 요청에 따라 **테스트 코드는 작성하지 않는다**.  
> 모든 기능 테스트는 사용자가 직접 수행한다.

---

## 12. DB 마이그레이션 전략

- **방식**: 순차 번호 기반의 **SQL 파일**을 `migrations/` 디렉터리에 두고, `psql` 혹은 간단한 Node 스크립트로 실행
  - 예: `migrations/0001_init.sql`
  - 실행 예시: `psql "$DATABASE_URL" -f migrations/0001_init.sql`
  - Node 실행 예시: `npm run db:migrate` → 내부에서 `psql` 호출 또는 `pg` 클라이언트로 파일 실행
- **장점**: SQL 위주 설계와 일관되며, `pgvector` 확장/인덱스 옵션을 세밀하게 관리 가능

### 12.1 초기 마이그레이션 예시 (`0001_init.sql`)

```sql
-- 확장
CREATE EXTENSION IF NOT EXISTS vector;

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- kb_category
CREATE TABLE IF NOT EXISTS kb_category (
  id           BIGSERIAL PRIMARY KEY,
  code         VARCHAR(64) NOT NULL UNIQUE,
  name         VARCHAR(255) NOT NULL,
  description  TEXT,
  sort_order   INT NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_kb_category_updated_at
BEFORE UPDATE ON kb_category
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE INDEX IF NOT EXISTS idx_kb_category_active_sort
  ON kb_category (is_active DESC, sort_order ASC, id DESC);

-- kb_article
CREATE TABLE IF NOT EXISTS kb_article (
  id           BIGSERIAL PRIMARY KEY,
  category_id  BIGINT NOT NULL REFERENCES kb_category(id),
  title        VARCHAR(255) NOT NULL,
  content      TEXT NOT NULL,
  summary      TEXT,
  priority     INT NOT NULL DEFAULT 0,
  requires_sm  BOOLEAN NOT NULL DEFAULT FALSE,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_kb_article_updated_at
BEFORE UPDATE ON kb_article
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE INDEX IF NOT EXISTS idx_kb_article_category ON kb_article (category_id);
CREATE INDEX IF NOT EXISTS idx_kb_article_published ON kb_article (is_published);
CREATE INDEX IF NOT EXISTS idx_kb_article_priority ON kb_article (priority DESC, id DESC);

-- kb_chunk
CREATE TABLE IF NOT EXISTS kb_chunk (
  id            BIGSERIAL PRIMARY KEY,
  article_id    BIGINT NOT NULL REFERENCES kb_article(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  embedding     vector(1536) NOT NULL, -- EMBEDDING_DIM과 동일해야 함
  chunk_index   INT NOT NULL,
  category_code VARCHAR(64) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kb_chunk_article ON kb_chunk (article_id);
CREATE INDEX IF NOT EXISTS idx_kb_chunk_category ON kb_chunk (category_code);
-- 생산 환경에서 유사도 검색 최적화를 위한 IVFFLAT 인덱스 (pgvector):
-- CREATE INDEX idx_kb_chunk_embedding ON kb_chunk USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- 주의: ivfflat 인덱스 생성 전, 충분한 데이터가 적재된 뒤 실행 권장.

-- (선택) 초기 카테고리 시드
INSERT INTO kb_category (code, name, sort_order)
VALUES
  ('NEED_SM', 'SM 문의 필요 항목', 1),
  ('STORAGE', '메뉴 보관 방법', 2),
  ('TAKEOUT', '포장 규정', 3),
  ('SALINITY', '염도 조절 규정', 4),
  ('ORDER_TIPS', '발주 팁', 5),
  ('CUSTOM_REQUEST', '추가 문의/요청 처리', 6)
ON CONFLICT (code) DO NOTHING;
```

### 12.2 추가 마이그레이션 시 권장 규칙

- 파일명: 증가 숫자 + 설명 (`0002_add_chunk_metadata.sql`, `0003_add_indexes.sql` 등)
- 되돌리기(다운) 스크립트는 MVP에서는 생략 가능하나, 추후 필요 시 별도 관리
- `vector` 컬럼 차원 변경이 필요할 경우:
  - 새 컬럼 추가 → 데이터 백필 → 기존 컬럼 드롭 → 이름 변경 순으로 단계적 진행
