import dotenv from 'dotenv';

dotenv.config();

const toNumber = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toFloat = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value === '') return fallback;
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: toNumber(process.env.PORT, 3000),
  databaseUrl: process.env.DATABASE_URL || '',
  adminPassword: process.env.ADMIN_PASSWORD,
  userPassword: process.env.USER_PASSWORD,
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiBaseUrl: process.env.OPENAI_BASE_URL,
  llmModel: process.env.LLM_MODEL || 'gpt-5.1',
  embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
  embeddingDim: toNumber(process.env.EMBEDDING_DIM, 1536),
  ragTopK: toNumber(process.env.RAG_TOP_K, 5),
  ragMinScore: toFloat(process.env.RAG_MIN_SCORE, 0.8),
  llmPromptCostPer1k: toFloat(process.env.LLM_PROMPT_COST_PER_1K, 0),
  llmCompletionCostPer1k: toFloat(process.env.LLM_COMPLETION_COST_PER_1K, 0)
};

export const requireEnvString = (key: keyof typeof env) => {
  const value = env[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`필수 환경변수가 설정되지 않았습니다: ${key}`);
  }
  return value;
};
