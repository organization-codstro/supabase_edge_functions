import { summarizeMessages } from "./agent/agent.ts";
import { getMessages } from "./repository/getMessages.ts";
import { lockAndGetJob } from "./repository/lockAndGetJob.ts";
import { saveMemory } from "./repository/saveMemory.ts";
import { markJobDone, markJobFailed } from "./repository/updateJobStatus.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { job_id } = await req.json();

    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1. job lock (pending → processing, UPDATE RETURNING)
    // null이면 이미 다른 worker가 처리 중 → skip
    const job = await lockAndGetJob(job_id);
    if (!job) {
      return new Response(
        JSON.stringify({
          skipped: true,
          reason: "job already taken or not pending",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    try {
      // 2. 메시지 범위 조회
      const messages = await getMessages(
        job.chat_room_id,
        job.chat_memory_job_start_index,
        job.chat_memory_job_end_index,
      );

      if (messages.length === 0) {
        await markJobFailed(
          job.chat_memory_job_id,
          job.chat_memory_job_retry_count,
          "no messages found in range",
        );
        return new Response(
          JSON.stringify({
            success: false,
            reason: "no messages found in range",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // 3. OpenAI 요약
      const memoryContents = await summarizeMessages(messages);

      // 4. chat_memorys 테이블에 저장
      await saveMemory({
        chatRoomId: job.chat_room_id,
        startIndex: job.chat_memory_job_start_index,
        endIndex: job.chat_memory_job_end_index,
        contents: memoryContents,
      });

      // 5. job 상태 done으로 변경
      await markJobDone(job.chat_memory_job_id);

      return new Response(
        JSON.stringify({ success: true, job_id: job.chat_memory_job_id }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } catch (processingError) {
      // 처리 중 에러 → retry 또는 failed 처리
      const errorMessage =
        processingError instanceof Error
          ? processingError.message
          : "Unknown processing error";

      await markJobFailed(
        job.chat_memory_job_id,
        job.chat_memory_job_retry_count,
        errorMessage,
      );

      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
  } catch (err) {
    console.error("process-chat-memory-job error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
