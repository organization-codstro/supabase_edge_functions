import { getPendingJobs } from "./repository/getPendingJobs.ts";
import { PROCESS_JOB_URL } from "../_shared/config.ts";

Deno.serve(async (req: Request) => {
  // cron 호출은 POST로 들어옴
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // 1. pending 상태 job 전체 조회
    const pendingJobs = await getPendingJobs();

    if (pendingJobs.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          processed: 0,
          message: "no pending jobs",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    console.log(`[schedule] found ${pendingJobs.length} pending job(s)`);

    // 2. 각 job_id로 process 함수 병렬 호출
    const results = await Promise.allSettled(
      pendingJobs.map((job) => callProcessJob(job.chat_memory_job_id)),
    );

    // 3. 결과 집계
    const summary = results.map((result, i) => {
      const jobId = pendingJobs[i].chat_memory_job_id;
      if (result.status === "fulfilled") {
        return { job_id: jobId, status: "called", response: result.value };
      } else {
        console.error(
          `[schedule] failed to call process for job ${jobId}:`,
          result.reason,
        );
        return {
          job_id: jobId,
          status: "call_failed",
          error: String(result.reason),
        };
      }
    });

    const successCount = summary.filter((s) => s.status === "called").length;
    const failCount = summary.filter((s) => s.status === "call_failed").length;

    console.log(
      `[schedule] done. success: ${successCount}, failed: ${failCount}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        total: pendingJobs.length,
        called: successCount,
        call_failed: failCount,
        summary,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[schedule] error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

/**
 * process-chat-memory-job 함수를 job_id와 함께 호출
 * fire & forget이 아닌 호출 성공 여부만 확인
 * 실제 처리 성공/실패는 process 함수 내부에서 job 상태로 관리
 */
async function callProcessJob(jobId: string): Promise<{ status: number }> {
  const response = await fetch(PROCESS_JOB_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
    },
    body: JSON.stringify({ job_id: jobId }),
  });

  return { status: response.status };
}
