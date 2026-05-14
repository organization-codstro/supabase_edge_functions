/**
 * GPT 응답에서 JSON을 안전하게 파싱하는 헬퍼
 *
 * GPT는 종종 아래 형태로 응답을 오염시킴:
 * 1. ```json ... ``` 마크다운 펜스
 * 2. 문자열 내부의 이스케이프된 따옴표 (\")
 * 3. JSON 블록 앞뒤의 설명 텍스트
 */
export function safeParseJson<T = unknown>(raw: string): T {
  // 1단계: 마크다운 코드 펜스 제거
  let cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // 2단계: 가장 바깥쪽 { } 블록만 추출
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`JSON 블록을 찾을 수 없습니다. 원본: ${raw.slice(0, 200)}`);
  }
  cleaned = cleaned.slice(start, end + 1);

  // 3단계: 우선 그대로 파싱 시도
  try {
    return JSON.parse(cleaned) as T;
  } catch (_) {
    // 4단계: 실패하면 문자열 값 내부의 \" 를 ' 로 치환 후 재시도
    const unescaped = cleaned.replace(
      /"((?:[^"\\]|\\.)*)"/g,
      (_match, inner: string) => {
        const safe = inner.replace(/\\"/g, "'");
        return `"${safe}"`;
      },
    );

    try {
      return JSON.parse(unescaped) as T;
    } catch (err) {
      throw new Error(
        `JSON 파싱 최종 실패: ${(err as Error).message}\n원본: ${raw.slice(0, 300)}`,
      );
    }
  }
}
