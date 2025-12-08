import { pool } from '../../config/db';
import { env } from '../../config/env';
import { EmbeddingsProvider } from '../../infra/llm/embeddings.provider';
import { LlmProvider } from '../../infra/llm/llm.provider';
import { RagChunk } from './types';
import { toPgVector } from '../../utils/pgvector';

const embeddingsProvider = new EmbeddingsProvider();
const llmProvider = new LlmProvider();

const BASE_POLICY_PROMPT = `너는 본사 운영 규정 상담원이다. 다음 원칙을 반드시 지켜라.
- 규정 청크가 있으면 그 내용만 근거로 짧고 단호하게 답한다. 청크에 없는 정보는 추측하지 않는다.
- 규정과 요청이 충돌하면 "규정상 불가합니다."라고 명확히 답한다.
- 매출·레시피 등 민감 영역은 상세 수치/레시피를 주지 말고 문의 절차만 안내한다.
- 규정 청크가 전혀 없거나 질문과 무관하면 "해당 매장 관련 규정이 없어 안내가 어려워요. 담당 sm에게 문의 부탁드립니다."를 한 번만 덧붙인다.
- 중복된 사과나 반복 멘션 없이 2~4문장 이내로 간결히 답한다.`;

export class ChatService {
  async preview(question: string) {
    const { chunks, fallbackToSm, requiresSmExists } = await this.retrieveRagContext(question);
    return { chunks, fallbackToSm, references: toReferences(chunks), requiresSmExists };
  }

  async getAnswer(question: string, opts?: { includeChunks?: boolean }) {
    const { chunks, fallbackToSm, requiresSmExists } = await this.retrieveRagContext(question);
    const policyPrompt = buildPolicyPrompt(requiresSmExists, chunks.length > 0);
    const answer = await llmProvider.generateAnswer({
      question,
      contextChunks: chunks,
      policyPrompt
    });
    const finalFallback = fallbackToSm || requiresSmExists;
    return {
      answer,
      fallback_to_sm: finalFallback,
      references: toReferences(chunks),
      used_chunks: opts?.includeChunks ? chunks : undefined
    };
  }

  async streamAnswer(question: string) {
    const { chunks, fallbackToSm, requiresSmExists } = await this.retrieveRagContext(question);
    const policyPrompt = buildPolicyPrompt(requiresSmExists, chunks.length > 0);
    const stream = llmProvider.streamAnswer({
      question,
      contextChunks: chunks,
      policyPrompt
    });
    return { stream, fallbackToSm, references: toReferences(chunks) };
  }

  private async retrieveRagContext(question: string) {
    const embedding = await embeddingsProvider.embedText(question);
    const embeddingParam = toPgVector(embedding);
    const client = await pool.connect();
    try {
      const result = await client.query(
        `
        SELECT
          c.id AS chunk_id,
          c.article_id,
          c.category_code,
          c.content,
          a.title,
          a.requires_sm,
          1 - (c.embedding <=> $1::vector) AS chunk_score,
          COALESCE(1 - (a.title_embedding <=> $1::vector), 0) AS title_score,
          ((1 - (c.embedding <=> $1::vector)) * 0.4 + COALESCE(1 - (a.title_embedding <=> $1::vector), 0) * 0.6) AS score
        FROM kb_chunk c
        JOIN kb_article a ON a.id = c.article_id
        WHERE a.is_published = true
        ORDER BY ((1 - (c.embedding <=> $1::vector)) * 0.4 + COALESCE(1 - (a.title_embedding <=> $1::vector), 0) * 0.6) DESC
        LIMIT $2;
        `,
        [embeddingParam, env.ragTopK]
      );
      const chunks: RagChunk[] = result.rows.map((row) => ({
        chunk_id: row.chunk_id,
        article_id: row.article_id,
        category_code: row.category_code,
        title: row.title,
        requires_sm: row.requires_sm,
        content: row.content,
        score: Number(row.score),
        chunk_score: Number(row.chunk_score),
        title_score: Number(row.title_score)
      }));

      // 임계값 필터링: 제목 또는 청크 점수 중 하나라도 임계 이상이면 포함
      const filtered = chunks.filter(
        (c) => (c.score ?? 0) >= env.ragMinScore || (c.title_score ?? 0) >= env.ragMinScore
      );
      const requiresSmExists = filtered.some((c) => c.requires_sm);
      const fallbackToSm = filtered.length === 0;

      return { chunks: filtered, fallbackToSm, requiresSmExists };
    } finally {
      client.release();
    }
  }
}

function toReferences(chunks: RagChunk[]) {
  // title은 쿼리에서 가져오므로 chunks에 포함돼 있어야 한다.
  return chunks.map((c) => ({
    article_id: c.article_id,
    category_code: c.category_code,
    title: (c as any).title
  }));
}

function buildPolicyPrompt(requiresSmExists: boolean, hasChunks: boolean) {
  const extra: string[] = [];
  if (requiresSmExists) {
    extra.push(
      '- 검색된 규정에 requires_sm=true가 포함되어 있으므로 반드시 "담당 sm에게 문의 부탁드립니다." 멘션을 답변에 포함한다.'
    );
  }
  if (!hasChunks) {
    extra.push('- 규정 청크가 없으므로 모른다고 답하고 "담당 sm에게 문의 부탁드립니다."를 반드시 포함한다.');
  }
  return [BASE_POLICY_PROMPT, ...extra].join('\n');
}
