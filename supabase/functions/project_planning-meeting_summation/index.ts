import { createClient } from "jsr:@supabase/supabase-js@2";
import OpenAI from "jsr:@openai/openai";
import { getAccumulatedSummaryPrompt } from "./prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { room_id } = await req.json();

    if (!room_id) {
      return new Response(JSON.stringify({ error: "room_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const openai = new OpenAI({ apiKey: openaiApiKey });

    // 1. 회의방 정보 조회
    const { data: room, error: roomError } = await supabase
      .from("project_meeting_rooms")
      .select(
        "project_meeting_room_id, project_meeting_name, project_meeting_purpose, project_meeting_detail, project_meeting_room_type, project_meeting_index",
      )
      .eq("project_meeting_room_id", room_id)
      .single();

    if (roomError || !room) {
      return new Response(
        JSON.stringify({ error: "Room not found", detail: roomError }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const currentIndex = room.project_meeting_index;

    // 2. 현재 회차의 아직 요약 안 된 메시지 조회
    const { data: logs, error: logsError } = await supabase
      .from("project_meeting_logs")
      .select(
        "project_meeting_log_sender, project_meeting_log_message, created_at",
      )
      .eq("project_meeting_room_id", room_id)
      .gte("project_meeting_log_meeting_index", currentIndex)
      .order("created_at", { ascending: true });

    if (logsError) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch logs", detail: logsError }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!logs || logs.length === 0) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "No messages to summarize" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 3. 기존 누적 요약 조회 (있으면 GPT에 함께 전달)
    const { data: existingSummary } = await supabase
      .from("project_meeting_summarys")
      .select("project_meeting_summary, project_meeting_summary_meeting_index")
      .eq("project_meeting_room_id", room_id)
      .maybeSingle();

    // 4. 이번 회차 대화 내용 포맷
    const conversationText = logs
      .map(
        (log) =>
          `[${log.project_meeting_log_sender}]: ${log.project_meeting_log_message}`,
      )
      .join("\n");

    // 5. 이전 요약 섹션 (있을 때만 포함)
    const previousSummarySection = existingSummary
      ? `\n\n---\n아래는 이전 회차까지의 누적 요약입니다. 이번 회차 내용을 반영하여 전체 요약을 하나로 통합해주세요:\n\n${existingSummary.project_meeting_summary}`
      : "";

    // 6. room_type에 따른 시스템 프롬프트 분기
    const systemPrompt = getAccumulatedSummaryPrompt({
      type: room.project_meeting_room_type,
      name: room.project_meeting_name,
      purpose: room.project_meeting_purpose,
      detail: room.project_meeting_detail,
    });

    // 7. GPT 누적 요약 생성
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `다음은 ${currentIndex}회차 회의 대화 내용입니다:\n\n${conversationText}${previousSummarySection}`,
        },
      ],
      max_tokens: 1500,
    });

    const summaryText = completion.choices[0]?.message?.content;

    if (!summaryText) {
      return new Response(
        JSON.stringify({ error: "GPT returned empty response" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 8. UPSERT — project_meeting_room_id 기준으로 있으면 UPDATE, 없으면 INSERT
    const { data: savedSummary, error: summaryError } = await supabase
      .from("project_meeting_summarys")
      .upsert(
        {
          project_meeting_room_id: room_id,
          project_meeting_summary: summaryText,
          project_meeting_summary_meeting_index: currentIndex,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "project_meeting_room_id" },
      )
      .select()
      .single();

    if (summaryError) {
      return new Response(
        JSON.stringify({
          error: "Failed to save summary",
          detail: summaryError,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 9. 회의방 회차(index) +1 증가
    const { error: incrementError } = await supabase
      .from("project_meeting_rooms")
      .update({ project_meeting_index: currentIndex + 1 })
      .eq("project_meeting_room_id", room_id);

    if (incrementError) {
      return new Response(
        JSON.stringify({
          error: "Summary saved but failed to increment meeting index",
          detail: incrementError,
          summary: savedSummary,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 10. 성공 응답
    return new Response(
      JSON.stringify({
        success: true,
        summary: savedSummary,
        previous_index: currentIndex,
        new_index: currentIndex + 1,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Unexpected error", detail: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
