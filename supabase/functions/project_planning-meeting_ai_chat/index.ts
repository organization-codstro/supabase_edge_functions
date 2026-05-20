import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { supabaseClient } from "../_shared/supabaseClient.ts";
import { chatCompletion } from "../_shared/openaiClient.ts";

import type { ChatCompletionMessageParam } from "npm:openai/resources/chat/completions";
import { getChatSystemPrompt } from "./prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function sendTypingBroadcast(
  supabaseUrl: string,
  serviceRoleKey: string,
  roomId: string,
  event: "typing_start" | "typing_end",
) {
  await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      messages: [
        {
          topic: `room_typing_${roomId}`,
          event,
          payload: { sender: "AI" },
        },
      ],
    }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = supabaseClient;

    const { room_id } = await req.json();

    if (!room_id) {
      return new Response(JSON.stringify({ error: "room_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. 회의방 조회
    const { data: room, error: roomError } = await supabase
      .from("project_meeting_rooms")
      .select(
        `
        project_meeting_room_id,
        project_meeting_name,
        project_meeting_purpose,
        project_meeting_detail,
        project_meeting_room_type,
        project_meeting_index
      `,
      )
      .eq("project_meeting_room_id", room_id)
      .single();

    if (roomError || !room) {
      return new Response(JSON.stringify({ error: "Room not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. 로그 조회
    const { data: logs, error: logsError } = await supabase
      .from("project_meeting_logs")
      .select(
        `
        project_meeting_log_sender,
        project_meeting_log_message,
        project_meeting_log_meeting_index,
        created_at
      `,
      )
      .eq("project_meeting_room_id", room_id)
      .gte("project_meeting_log_meeting_index", room.project_meeting_index)
      .order("created_at", { ascending: true });

    if (logsError) {
      return new Response(JSON.stringify({ error: "Failed to fetch logs" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lastLog = logs?.[logs.length - 1];
    if (!lastLog || lastLog.project_meeting_log_sender !== "USER") {
      return new Response(
        JSON.stringify({ skipped: "last message is not from user" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. 기존 요약 조회
    const { data: existingSummary } = await supabase
      .from("project_meeting_summarys")
      .select("project_meeting_summary")
      .eq("project_meeting_room_id", room_id)
      .maybeSingle();

    // 4. typing start
    await sendTypingBroadcast(
      supabaseUrl,
      serviceRoleKey,
      room_id,
      "typing_start",
    );

    // 5. 프롬프트 (외부 사용)
    const systemPrompt = getChatSystemPrompt(
      room,
      existingSummary?.project_meeting_summary,
    );

    const historyMessages: ChatCompletionMessageParam[] = (logs ?? []).map(
      (log) => ({
        role: log.project_meeting_log_sender === "USER" ? "user" : "assistant",
        content: log.project_meeting_log_message,
      }),
    );

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...historyMessages,
    ];

    // 6. GPT 호출
    const completion = await chatCompletion(messages);

    const aiMessage =
      completion.choices[0]?.message?.content ?? "응답을 생성하지 못했습니다.";

    // 7. DB 저장
    const { error: insertError } = await supabase
      .from("project_meeting_logs")
      .insert({
        project_meeting_room_id: room_id,
        project_meeting_log_sender: "AI",
        project_meeting_log_message: aiMessage,
        project_meeting_log_meeting_index: room.project_meeting_index,
      });

    if (insertError) {
      return new Response(
        JSON.stringify({
          error: "Failed to save AI response",
          detail: insertError,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 8. typing end
    await sendTypingBroadcast(
      supabaseUrl,
      serviceRoleKey,
      room_id,
      "typing_end",
    );

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
