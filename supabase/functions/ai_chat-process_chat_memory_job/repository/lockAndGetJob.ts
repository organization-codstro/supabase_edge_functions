import { supabaseClient } from "../../_shared/supabaseClient.ts";
import type { ChatMemoryJob } from "../types/job.ts";

/**
 * pending 상태의 job을 processing으로 변경하면서 동시에 조회
 * UPDATE ... RETURNING 방식으로 job lock 처리
 * → worker가 여러 개여도 같은 job이 중복 실행되지 않음
 */
export async function lockAndGetJob(
  jobId: string,
): Promise<ChatMemoryJob | null> {
  const { data, error } = await supabaseClient
    .from("chat_memory_jobs")
    .update({ chat_memory_job_status: "processing" })
    .eq("chat_memory_job_id", jobId)
    .eq("chat_memory_job_status", "pending") // pending 상태일 때만 lock
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(`lockAndGetJob error: ${error.message}`);
  }

  // null이면 이미 다른 worker가 가져간 것
  return data as ChatMemoryJob | null;
}
