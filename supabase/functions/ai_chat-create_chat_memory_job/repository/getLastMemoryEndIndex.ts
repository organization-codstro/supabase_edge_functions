import { supabaseClient } from "../../_shared/supabaseClient.ts";

/**
 * 해당 채팅방의 마지막 memory end_message_index 조회
 * 없으면 0 반환 (한 번도 메모리 생성 안 된 상태)
 */
export async function getLastMemoryEndIndex(
  chatRoomId: string,
): Promise<number> {
  const { data, error } = await supabaseClient
    .from("chat_memorys")
    .select("end_message_index")
    .eq("chat_room_id", chatRoomId)
    .order("end_message_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`getLastMemoryEndIndex error: ${error.message}`);
  }

  return data?.end_message_index ?? 0;
}
