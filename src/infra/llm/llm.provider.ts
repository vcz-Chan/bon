import OpenAI from 'openai';
import { env, requireEnvString } from '../../config/env';
import { RagChunk } from '../../modules/chat/types';

const client = new OpenAI({
  apiKey: requireEnvString('openaiApiKey'),
  baseURL: env.openaiBaseUrl || undefined
});

type GenerateParams = {
  question: string;
  contextChunks: RagChunk[];
  policyPrompt: string;
};

export class LlmProvider {
  async generateAnswer(params: GenerateParams): Promise<string> {
    const { question, contextChunks, policyPrompt } = params;
    const messages = buildMessages(question, contextChunks, policyPrompt);
    const res = await client.chat.completions.create({
      model: env.llmModel,
      messages
    });
    return res.choices[0].message?.content || '';
  }

  async *streamAnswer(params: GenerateParams): AsyncIterable<string> {
    const { question, contextChunks, policyPrompt } = params;
    const messages = buildMessages(question, contextChunks, policyPrompt);
    const stream = await client.chat.completions.create({
      model: env.llmModel,
      messages,
      stream: true
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield delta;
      }
    }
  }
}

function buildMessages(question: string, contextChunks: RagChunk[], policyPrompt: string) {
  const contextText =
    contextChunks.length === 0
      ? '없음 (규정 청크가 제공되지 않았음)'
      : contextChunks
          .map((c, idx) => {
            const title = c.title || '(제목 없음)';
            const requiresSm = c.requires_sm ? 'Y' : 'N';
            return `[${idx + 1}] category=${c.category_code}, requires_sm=${requiresSm}
제목: ${title}
내용: ${c.content}`;
          })
          .join('\n\n');

  return [
    {
      role: 'system',
      content: `${policyPrompt}
추가 지시:
- 먼저 사용자 질문을 이해한 뒤, 규정 청크에서 답변 근거를 찾는다.
- 규정 청크가 있으면 제목과 본문을 함께 참고해 질문과 직접 관련된 내용만 근거로 2~4문장 이내로 간결하게 답한다.
- 청크에 없는 정보는 추측하거나 만들어내지 않는다.
- 규정 청크가 없거나 무관하면 친절하게 "해당 매장 관련 규정이 없어 안내가 어려워요. 담당 sm에게 문의 부탁드립니다."라고 한 번만 덧붙인다.
- 중복된 사과/반복 멘션을 피한다.`
    },
    {
      role: 'user',
      content: `사용자 질문: ${question}

검색된 규정 청크:
${contextText}

응답 지침:
- 질문을 먼저 이해/요약하고, 규정 청크의 제목과 본문 중 질문과 직접 관련된 부분만 근거로 사용해 답한다.
- 규정 청크가 있으면 그 근거(제목+본문)에 기반해 답한다.
- 규정 청크가 없거나 무관하면 모른다고 답하고 "담당 sm에게 문의 부탁드립니다."를 한 번만 덧붙인다.
- 규정 외 정보는 추측하지 말고 모른다고 답한다.`
    }
  ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[];
}
