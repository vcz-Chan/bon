import OpenAI from 'openai';
import { env, requireEnvString } from '../../config/env';

const client = new OpenAI({
  apiKey: requireEnvString('openaiApiKey'),
  baseURL: env.openaiBaseUrl || undefined
});

export class EmbeddingsProvider {
  async embedText(text: string): Promise<number[]> {
    const res = await client.embeddings.create({
      model: env.embeddingModel,
      input: text
    });
    // Assume single embedding
    return res.data[0].embedding as unknown as number[];
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    const res = await client.embeddings.create({
      model: env.embeddingModel,
      input: texts
    });
    return res.data.map((item) => item.embedding as unknown as number[]);
  }
}
