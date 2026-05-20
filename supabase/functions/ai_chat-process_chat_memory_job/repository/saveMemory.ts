import { supabaseClient } from "../../_shared/supabaseClient.ts";
import type { MemoryContents } from "../types/job.ts";

/**
 * 요약 결과를 chat_memorys 테이블에 저장
 */
export async function saveMemory(params: {
  chatRoomId: string;
  startIndex: number;
  endIndex: number;
  contents: MemoryContents;
}): Promise<void> {
  const { chatRoomId, startIndex, endIndex, contents } = params;

  const { error } = await supabaseClient.from("chat_memorys").insert({
    chat_room_id: chatRoomId,
    start_message_index: startIndex,
    end_message_index: endIndex,
    chat_memory_contents: contents,
  });

  if (error) {
    throw new Error(`saveMemory error: ${error.message}`);
  }
}
