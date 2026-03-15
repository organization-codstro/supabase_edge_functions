import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { supabaseClient } from "../../../_shared/supabaseClient.ts";
import { ChatMessage } from "../../types/tools.ts";

// OpenAI에 넘길 tool 정의
export const getChatHistoryTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "getChatHistory",
    description: `채팅방의 대화 내역을 50개씩 가져옵니다.
- index 0: 가장 최근 메시지 50개
- index 1: 그 이전 50개 (51~100번째)
- 특정 과거 대화가 필요할 경우, getChatMemory tool로 요약을 먼저 확인하고
  start_message_index / end_message_index를 참고하여 적절한 index를 계산해 호출하세요.
- index 계산 방법: Math.floor(start_message_index / 50)`,
    parameters: {
      type: "object",
      properties: {
        roomId: {
          type: "string",
          description: "채팅방 ID",
        },
        index: {
          type: "number",
          description: "페이지 인덱스 (0부터 시작, 기본값 0)",
        },
      },
      required: ["roomId"],
    },
  },
};

export async function getChatHistory(
  roomId: string,
  index: number = 0,
): Promise<ChatMessage[]> {
  const INITIAL_COUNT = 20; // 초기에 이미 제공된 메시지 수
  const PAGE_SIZE = 50;

  const from = INITIAL_COUNT + index * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data } = await supabaseClient
    .from("chat_messages")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .range(from, to);

  return data ?? [];
}
