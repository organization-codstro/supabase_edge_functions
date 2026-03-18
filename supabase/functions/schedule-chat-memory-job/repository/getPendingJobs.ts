import { supabaseClient } from "../../_shared/supabaseClient.ts";
import type { ChatMemoryJob } from "../types/job.ts";

/**
 * pending 상태의 job 전체 조회
 * created_at 오름차순 → 오래된 job부터 처리
 */
export async function getPendingJobs(): Promise<ChatMemoryJob[]> {
  const { data, error } = await supabaseClient
    .from("chat_memory_jobs")
    .select("*")
    .eq("chat_memory_job_status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`getPendingJobs error: ${error.message}`);
  }

  return (data ?? []) as ChatMemoryJob[];
}
