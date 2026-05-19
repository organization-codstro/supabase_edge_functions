/**
 * chat memory job 스케줄러 (현제 사용하지 않음)
 * 아래 주석은 이 함수를 사용하지 않으면서 등록되어있는 정보도 같이 지우면서 작성하였습니다.
 *
 * 역할:
 * - cron 스케줄러가 주기적으로 호출하는 진입점
 * - DB에서 pending 상태의 chat memory job 조회
 * - 조회된 각 job을 ai_chat-process_chat_memory_job 함수에 병렬 전달
 * - 호출 성공/실패 결과를 집계하여 반환
 *
 * 처리 흐름:
 * 1. POST 요청 검증
 * 2. pending job 조회
 * 3. 각 job을 process 함수로 병렬 호출
 * 4. 호출 결과(success / fail) 집계
 * 5. 실행 요약 응답 반환
 *
 * 참고:
 * - 실제 AI 메모리 생성/처리는 process 함수 내부에서 수행
 * - 이 함수는 작업을 분배하고 호출 상태만 관리
 * - job의 최종 성공/실패 상태는 process 함수가 DB에서 업데이트
 */

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
 * ai_chat-process_chat_memory_job 함수를 job_id와 함께 호출
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
