import { supabaseClient } from "../../_shared/supabaseClient.ts";
import type { ChatMessage } from "../types/job.ts";

/**
 * 채팅방의 특정 index 범위 메시지 조회
 */
export async function getMessages(
  chatRoomId: string,
  startIndex: number,
  endIndex: number,
): Promise<ChatMessage[]> {
  const { data, error } = await supabaseClient
    .from("chat_messages")
    .select(
      "chat_message_index, chat_message_sender_type, chat_message_content",
    )
    .eq("chat_room_id", chatRoomId)
    .gte("chat_message_index", startIndex)
    .lte("chat_message_index", endIndex)
    .order("chat_message_index", { ascending: true });

  if (error) {
    throw new Error(`getMessages error: ${error.message}`);
  }

  return (data ?? []) as ChatMessage[];
}
