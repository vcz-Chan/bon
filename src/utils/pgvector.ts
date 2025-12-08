export const toPgVector = (values: number[]) => `[${values.join(',')}]`;

export const toPgVectorMany = (embeddings: number[][]) => embeddings.map(toPgVector);
