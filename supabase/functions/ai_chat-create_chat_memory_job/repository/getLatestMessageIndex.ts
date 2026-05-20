import { supabaseClient } from "../../_shared/supabaseClient.ts";

/**
 * 해당 채팅방의 현재 최신 메시지 index 조회
 */
export async function getLatestMessageIndex(
  chatRoomId: string,
): Promise<number | null> {
  const { data, error } = await supabaseClient
    .from("chat_messages")
    .select("chat_message_index")
    .eq("chat_room_id", chatRoomId)
    .order("chat_message_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`getLatestMessageIndex error: ${error.message}`);
  }

  return data?.chat_message_index ?? null;
}
