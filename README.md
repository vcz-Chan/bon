# RAG 챗봇 백엔드 (MVP)

TypeScript + Express + Postgres(pgvector) 기반의 가맹점주 운영 매뉴얼 RAG 챗봇 백엔드입니다. LLM/임베딩은 OpenAI 전용(gpt-5 계열, text-embedding-3-small 권장)으로 구성됩니다.

## 주요 기능
- 가맹점주 챗봇 질의 (비스트리밍 / SSE 스트리밍)
- 관리자: 카테고리/문서 CRUD, 문서 저장 시 청크 분할 + 임베딩 생성/재생성
- 관리자: 프리뷰 API (질문 → RAG → LLM 응답 + 사용 청크 반환)
- 환경변수 기반 비밀번호 인증 (`X-Admin-Password`, `X-User-Password`)

## 요구사항
- Node.js 20+ (권장)
- PostgreSQL + `pgvector` 확장 설치
- OpenAI API 키

## 환경변수(.env)
`.env.example`을 참고해 설정하세요.

필수 예시:
```
NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://user:password@localhost:5432/bone
ADMIN_PASSWORD=change-me-admin
USER_PASSWORD=change-me-user
OPENAI_API_KEY=your-openai-key
LLM_MODEL=gpt-5.1
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIM=1536
RAG_TOP_K=5
RAG_MIN_SCORE=0.8
```

## 설치 및 실행
```bash
npm install
npm run db:migrate   # migrations/*.sql 순차 실행
npm run dev          # 개발 모드 (ts-node-dev)
# npm run build && npm start  # 프로덕션 빌드/실행
```

## 주요 엔드포인트
- 헬스체크: `GET /healthz`
- 인증 확인: `POST /api/auth/verify`
- 가맹점주 챗봇
  - `POST /api/user/chat` (비스트리밍)
  - `POST /api/user/chat/stream` (SSE: 이벤트 `meta`/`chunk`/`end`/`error`)
- 관리자 카테고리: `GET/POST/PUT/DELETE /api/admin/categories`
- 관리자 문서: `GET/POST/PUT/DELETE /api/admin/articles`
- 관리자 프리뷰: `POST /api/admin/preview-chat`

## SSE 사용 예시 (fetch 스트림)
```js
const res = await fetch('/api/user/chat/stream', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-User-Password': '<USER_PASSWORD>'
  },
  body: JSON.stringify({ question: '질문 내용' })
});
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  let boundary;
  while ((boundary = buffer.indexOf('\n\n')) !== -1) {
    const rawEvent = buffer.slice(0, boundary);
    buffer = buffer.slice(boundary + 2);
    // rawEvent 예시:
    // event: chunk\n
data: {"text":"..."}
    // event: end\n
data: {}
  }
}
```

## 보안/로그 주의
- 비밀번호 헤더(`X-Admin-Password`, `X-User-Password`)는 HTTPS 환경에서만 사용하십시오.
- 에러 로그에서 민감 헤더는 마스킹됩니다.

## 테스트
- 사용자 요청에 따라 **테스트 코드는 작성하지 않습니다.**
