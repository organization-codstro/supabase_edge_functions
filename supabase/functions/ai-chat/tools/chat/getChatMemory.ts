import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { supabaseClient } from "../../../_shared/supabaseClient.ts";
import { ChatMemory } from "../../types/tools.ts";

export const getChatMemoryTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "getChatMemory",
    description: `채팅방의 대화 요약 목록을 가져옵니다.
- 각 요약은 50개 메시지 단위로 생성되어 있으며, 10개씩 페이지네이션됩니다.
- start_message_index / end_message_index로 해당 요약이 어느 메시지 구간인지 확인할 수 있습니다.
- 특정 시점의 대화가 필요하면: 요약으로 구간 파악 → getChatHistory의 index(= Math.floor(start_message_index / 50) - 1) 로 상세 메시지를 조회하세요.
- index 0이 가장 최근 요약입니다.`,
    parameters: {
      type: "object",
      properties: {
        roomId: {
          type: "string",
          description: "채팅방 ID",
        },
        index: {
          type: "number",
          description:
            "페이지 인덱스 (0부터 시작, 기본값 0). 0이면 가장 최근 요약 10개.",
        },
      },
      required: ["roomId"],
    },
  },
};

export async function getChatMemory(
  roomId: string,
  index: number = 0,
): Promise<ChatMemory[]> {
  const PAGE_SIZE = 10;
  const from = index * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data } = await supabaseClient
    .from("chat_memorys")
    .select("*")
    .eq("chat_room_id", roomId)
    .order("start_message_index", { ascending: false }) // 최근 요약부터
    .range(from, to);

  return data ?? [];
}
