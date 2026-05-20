import { SERVICE_ROLE_KEY } from "../_shared/config.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";
import { MEMORY_BATCH_SIZE } from "./constant/constant.ts";
import { createJob } from "./repository/createJob.ts";
import { getLastMemoryEndIndex } from "./repository/getLastMemoryEndIndex.ts";
import { getLatestMessageIndex } from "./repository/getLatestMessageIndex.ts";
import { getPendingJob } from "./repository/getPendingJob.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { chat_room_id } = await req.json();

    if (!chat_room_id) {
      return new Response(
        JSON.stringify({ error: "chat_room_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // 1. 이미 pending/processing job이 있으면 skip (중복 방지)
    const hasPendingJob = await getPendingJob(chat_room_id);
    if (hasPendingJob) {
      return new Response(
        JSON.stringify({
          skipped: true,
          reason: "pending or processing job already exists",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // 2. 마지막 memory end_index 조회 (없으면 0)
    const lastMemoryEndIndex = await getLastMemoryEndIndex(chat_room_id);

    // 3. 현재 최신 메시지 index 조회
    const latestMessageIndex = await getLatestMessageIndex(chat_room_id);
    if (latestMessageIndex === null) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "no messages found" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // 4. 새 job 범위 계산
    // lastMemoryEndIndex = 0이면 처음이므로 start = 1
    const startIndex = lastMemoryEndIndex === 0 ? 1 : lastMemoryEndIndex + 1;
    const endIndex = latestMessageIndex;
    const rangeSize = endIndex - startIndex + 1;

    // 5. 범위가 MEMORY_BATCH_SIZE 이상이어야 job 생성
    if (rangeSize < MEMORY_BATCH_SIZE) {
      return new Response(
        JSON.stringify({
          skipped: true,
          reason: `not enough messages (${rangeSize}/${MEMORY_BATCH_SIZE})`,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // 6. job 생성 (50개 단위로 잘라서 생성)
    // ex) 범위가 120개면 1~50, 51~100 두 개 생성 (101~120은 아직 미생성)
    const jobs: Array<{ start: number; end: number }> = [];
    let cursor = startIndex;

    while (cursor + MEMORY_BATCH_SIZE - 1 <= endIndex) {
      jobs.push({ start: cursor, end: cursor + MEMORY_BATCH_SIZE - 1 });
      cursor += MEMORY_BATCH_SIZE;
    }

    for (const job of jobs) {
      const jobId = await createJob({
        chat_room_id,
        start_index: job.start,
        end_index: job.end,
      });

      // 잡 생성 직후 바로 process 호출 (fire-and-forget)
      console.log(`ai_chat-process_chat_memory_job 호출, jobId: ${jobId}`);
      fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai_chat-process_chat_memory_job`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ job_id: jobId }),
        },
      ).catch((err) =>
        console.error("process-chat-memory-job invoke failed:", err),
      );
    }

    return new Response(
      JSON.stringify({ success: true, jobs_created: jobs.length, jobs }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("ai_chat-create_chat_memory_job error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
