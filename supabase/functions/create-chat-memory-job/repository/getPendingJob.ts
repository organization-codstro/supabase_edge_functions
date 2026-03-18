import { supabaseClient } from "../../_shared/supabaseClient.ts";

/**
 * 해당 채팅방에 이미 pending 또는 processing 상태의 job이 있는지 확인
 * 중복 job 생성 방지용
 */
export async function getPendingJob(chatRoomId: string): Promise<boolean> {
  const { data, error } = await supabaseClient
    .from("chat_memory_jobs")
    .select("chat_memory_job_id")
    .eq("chat_room_id", chatRoomId)
    .in("chat_memory_job_status", ["pending", "processing"])
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`getPendingJob error: ${error.message}`);
  }

  return data !== null;
}
