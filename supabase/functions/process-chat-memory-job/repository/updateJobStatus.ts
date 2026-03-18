import { supabaseClient } from "../../_shared/supabaseClient.ts";
import { MAX_RETRY } from "../constant/constant.ts";

/**
 * job 처리 성공 시 done으로 변경
 */
export async function markJobDone(jobId: string): Promise<void> {
  const { error } = await supabaseClient
    .from("chat_memory_jobs")
    .update({ chat_memory_job_status: "done" })
    .eq("chat_memory_job_id", jobId);

  if (error) {
    throw new Error(`markJobDone error: ${error.message}`);
  }
}

/**
 * job 처리 실패 시 retry_count 증가
 * - MAX_RETRY 초과 시 → failed
 * - 이하 시 → pending (재처리 대상)
 */
export async function markJobFailed(
  jobId: string,
  currentRetryCount: number,
  errorMessage: string,
): Promise<void> {
  const nextRetryCount = currentRetryCount + 1;
  const nextStatus = nextRetryCount >= MAX_RETRY ? "failed" : "pending";

  const { error } = await supabaseClient
    .from("chat_memory_jobs")
    .update({
      chat_memory_job_status: nextStatus,
      chat_memory_job_retry_count: nextRetryCount,
    })
    .eq("chat_memory_job_id", jobId);

  if (error) {
    throw new Error(`markJobFailed error: ${error.message}`);
  }

  console.error(
    `job ${jobId} ${nextStatus === "failed" ? "permanently failed" : `retrying (${nextRetryCount}/${MAX_RETRY})`}: ${errorMessage}`,
  );
}
