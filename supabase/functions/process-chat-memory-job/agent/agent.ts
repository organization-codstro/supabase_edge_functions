import { client } from "../../_shared/openaiClient.ts";
import type { ChatMessage, MemoryContents } from "../types/job.ts";
import { buildSummaryPrompt } from "./prompt.ts";
import { memoryResponseFormat } from "./responseformat.ts";

/**
 * 메시지 목록을 OpenAI로 요약하여 MemoryContents 반환
 * response_format json_schema + strict: true로 구조 보장
 */
export async function summarizeMessages(
  messages: ChatMessage[],
): Promise<MemoryContents> {
  const prompt = buildSummaryPrompt(messages);

  const response = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: memoryResponseFormat,
  });

  // json_schema strict 모드에서는 파싱 실패 가능성 거의 없음
  // 단, content가 null인 경우(모델 거부 등)는 방어 처리
  const raw = response.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("OpenAI returned empty content");
  }

  return JSON.parse(raw) as MemoryContents;
}
