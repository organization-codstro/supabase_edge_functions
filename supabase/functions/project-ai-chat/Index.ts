import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import OpenAI from "npm:openai";
import type { ChatCompletionMessageParam } from "npm:openai/resources/chat/completions";

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY")!,
});

const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4.1-mini";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();

    // 프론트에서 직접 호출: { project_id }
    const { project_id: projectId } = body;

    if (!projectId) {
      return new Response(JSON.stringify({ error: "project_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── 1. 프로젝트 정보 조회 ───────────────────────────────────────────────
    const { data: project, error: projectError } = await supabase
      .from("project_plannings")
      .select(
        `
        project_name,
        project_description,
        project_topic,
        project_stacks,
        project_style,
        project_effect,
        project_main_color,
        project_start_date,
        project_end_date,
        project_planning_stage
      `,
      )
      .eq("project_id", projectId)
      .single();

    if (projectError || !project) {
      return new Response(
        JSON.stringify({ error: "Project not found", detail: projectError }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ─── 2. 대화 히스토리 조회 (최근 20개) ──────────────────────────────────
    const { data: logs, error: logsError } = await supabase
      .from("project_planning_logs")
      .select(
        "project_planning_log_sender, project_planning_log_message, project_planning_log_index",
      )
      .eq("project_id", projectId)
      .order("project_planning_log_index", {
        ascending: true,
        nullsFirst: false,
      })
      .order("created_at", { ascending: true })
      .limit(20);

    if (logsError) {
      console.error("Failed to fetch logs:", logsError);
    }

    // ─── 3. OpenAI 메시지 포맷 변환 ─────────────────────────────────────────
    const historyMessages: ChatCompletionMessageParam[] = (logs ?? []).map(
      (log) => ({
        role: log.project_planning_log_sender === "user" ? "user" : "assistant",
        content: log.project_planning_log_message,
      }),
    );

    // 마지막 메시지가 user가 아닌 경우 방어 처리
    if (
      historyMessages.length === 0 ||
      historyMessages[historyMessages.length - 1].role !== "user"
    ) {
      return new Response(
        JSON.stringify({ skipped: "last message is not from user" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── 4. 시스템 프롬프트 구성 ─────────────────────────────────────────────
    const projectContext = [
      project.project_name && `프로젝트명: ${project.project_name}`,
      project.project_description && `설명: ${project.project_description}`,
      project.project_topic && `주제: ${project.project_topic}`,
      project.project_stacks && `기술 스택: ${project.project_stacks}`,
      project.project_style && `스타일: ${project.project_style}`,
      project.project_effect && `효과/특징: ${project.project_effect}`,
      project.project_main_color && `메인 컬러: ${project.project_main_color}`,
      project.project_start_date && `시작일: ${project.project_start_date}`,
      project.project_end_date && `종료일: ${project.project_end_date}`,
      project.project_planning_stage &&
        `현재 기획 단계: ${project.project_planning_stage}`,
    ]
      .filter(Boolean)
      .join("\n");

    const systemMessage: ChatCompletionMessageParam = {
      role: "system",
      content: `당신은 프로젝트 기획 전문 AI 어시스턴트입니다.
아래 프로젝트 정보를 기반으로 사용자의 기획을 도와주세요.
구체적이고 실용적인 조언을 제공하며, 프로젝트의 방향성과 맥락을 항상 고려하세요.

[프로젝트 정보]
${projectContext || "아직 프로젝트 정보가 입력되지 않았습니다."}

답변은 명확하고 간결하게, 한국어로 작성해주세요.`,
    };

    const messages: ChatCompletionMessageParam[] = [
      systemMessage,
      ...historyMessages,
    ];

    // ─── 5. OpenAI API 호출 ───────────────────────────────────────────────────
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
    });

    const aiMessage =
      response.choices[0]?.message?.content ?? "응답을 생성하지 못했습니다.";

    // ─── 6. 다음 index 계산 ──────────────────────────────────────────────────
    const lastLog = logs?.[logs.length - 1];
    const nextIndex =
      lastLog?.project_planning_log_index != null
        ? lastLog.project_planning_log_index + 1
        : null;

    // ─── 7. AI 응답 DB 저장 ──────────────────────────────────────────────────
    const { error: insertError } = await supabase
      .from("project_planning_logs")
      .insert({
        project_id: projectId,
        project_planning_log_sender: "ai",
        project_planning_log_message: aiMessage,
        project_planning_log_index: nextIndex,
      });

    if (insertError) {
      console.error("Failed to insert AI message:", insertError);
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

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
