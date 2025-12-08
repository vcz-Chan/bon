const DEFAULT_MAX_CHARS = 800;

export function splitContentIntoChunks(content: string): string[] {
  const pieces = content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const piece of pieces) {
    if (piece.length <= DEFAULT_MAX_CHARS) {
      chunks.push(piece);
    } else {
      // 길면 일정 길이로 자른다.
      for (let i = 0; i < piece.length; i += DEFAULT_MAX_CHARS) {
        chunks.push(piece.slice(i, i + DEFAULT_MAX_CHARS));
      }
    }
  }

  // 내용이 하나도 없으면 빈 배열 대신 원본을 그대로 사용
  if (chunks.length === 0 && content.trim()) {
    chunks.push(content.trim());
  }
  return chunks;
}
