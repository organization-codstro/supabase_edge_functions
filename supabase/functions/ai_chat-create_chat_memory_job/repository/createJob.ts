import { supabaseClient } from "../../_shared/supabaseClient.ts";
import type { CreateJobParams } from "../types/job.ts";

/**
 * chat_memory_jobs 테이블에 pending 상태로 job 생성
 */
export async function createJob(params: CreateJobParams): Promise<string> {
  const { chat_room_id, start_index, end_index } = params;

  const { data, error } = await supabaseClient
    .from("chat_memory_jobs")
    .insert({
      chat_room_id,
      chat_memory_job_start_index: start_index,
      chat_memory_job_end_index: end_index,
      chat_memory_job_status: "pending",
      chat_memory_job_retry_count: 0,
    })
    .select("chat_memory_job_id")
    .single();

  if (error) throw new Error(`createJob error: ${error.message}`);

  return data.chat_memory_job_id;
}
