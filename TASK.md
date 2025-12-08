# 작업 계획 (백엔드 구현)

## 0. 전제
- 테스트 코드는 작성하지 않는다.
- LLM/임베딩은 OpenAI 전용 (LLM gpt-5 계열, 임베딩 text-embedding-3-small 권장).
- SSE 스트리밍은 `POST /api/user/chat/stream` + `text/event-stream`로 구현 (fetch 스트림 파싱).

## 1. 프로젝트 부트스트랩
- TypeScript + Express 기본 셋업 (`tsconfig`, `eslint` 선택, `nodemon`/`ts-node-dev` 등 개발용).
- 환경변수 로딩(`dotenv`) 및 구성 파일 (`src/config/env.ts`) 정의.
- 기본 `app.ts`/`server.ts` 분리, 헬스체크 엔드포인트 추가.

## 2. DB 연결 및 마이그레이션
- `pg` 클라이언트 초기화 (`src/config/db.ts`).
- `migrations/0001_init.sql` 추가/실행: `pgvector` 확장, `kb_category`, `kb_article`, `kb_chunk`, 트리거/인덱스, 시드.
- `npm run db:migrate` 스크립트 작성(간단 psql 호출 또는 Node 스크립트).

## 3. 도메인 모듈 스켈레톤
- `modules/auth`: 비밀번호 검증 서비스/미들웨어 (`X-Admin-Password`, `X-User-Password`).
- `modules/categories`: controller/service/repository.
- `modules/articles`: controller/service/repository, 청크 분할/임베딩 트리거 로직 포함.
- `modules/chunks`: repository (필요 시).
- `modules/chat`: controller/service (RAG + LLM 호출 + 스트리밍).
- 공통 미들웨어: auth, error handler.

## 4. LLM/임베딩 인프라
- `infra/llm/embeddings.provider.ts`: OpenAI 임베딩 호출 래퍼.
- `infra/llm/llm.provider.ts`: OpenAI 챗컴플리션 래퍼 (`generateAnswer`, `streamAnswer`).
- 정책 프롬프트 상수/빌더 정리.

## 5. RAG 서비스 구현
- 질문 임베딩 생성 → `kb_chunk` 유사도 검색 (`RAG_TOP_K`, `RAG_MIN_SCORE` 환경변수 적용).
- 검색 결과 + 문서 메타(`requires_sm` 등)로 컨텍스트 구성.
- 정책 프롬프트 적용 후 LLM 호출:
  - 비스트리밍: `generateAnswer` 반환.
  - 스트리밍: `streamAnswer` AsyncIterable을 SSE로 흘려보내기.
- 규정 없음/검색 미흡 시 SM 문의 멘션 강제, `fallback_to_sm` 플래그 처리.

## 6. 관리자 기능
- 카테고리 CRUD (정렬/활성화 포함).
- 문서 CRUD:
  - 생성/수정 시 청크 분할, 임베딩 생성 후 `kb_chunk` 갱신 (트랜잭션 처리 전략 결정: 외부 호출은 트랜잭션 밖 or 보상 로직).
  - 삭제 시 CASCADE로 청크 제거.
- 프리뷰 API: 질문 → RAG → LLM 호출(스트리밍 불필요)로 미리보기 응답/사용 청크 반환.

## 7. 가맹점주 챗봇 API
- `POST /api/user/chat`: 비스트리밍 응답 반환.
- `POST /api/user/chat/stream`: SSE 스트림 반환 (`chunk/meta/end/error` 이벤트 포맷).
- 공통 인증 헤더 검사, 입력 검증, 에러 처리.

## 8. 구성/배포 준비
- `.env.example` 작성 (필수/옵션 환경변수).
- README 초안(실행 방법, 마이그레이션, API 요약).
- 로깅 최소 설정 및 비밀번호 헤더 마스킹.
