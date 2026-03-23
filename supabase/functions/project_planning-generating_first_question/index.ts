import { createClient } from "jsr:@supabase/supabase-js@2";
import { generateFirstQuestion } from "./agent/agent.ts";

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
    const { project_id } = await req.json();

    if (!project_id) {
      return new Response(JSON.stringify({ error: "project_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. 프로젝트 정보 조회
    const { data: project, error: projectError } = await supabase
      .from("project_plannings")
      .select(
        "project_id, project_name, project_topic, project_description, project_stacks",
      )
      .eq("project_id", project_id)
      .single();

    if (projectError || !project) {
      return new Response(
        JSON.stringify({
          error: "Project not found",
          detail: projectError?.message,
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 2. AI로 첫 질문 생성
    const firstQuestion = await generateFirstQuestion(project);

    // 3. 현재 로그 인덱스 조회 (0부터 시작)
    const { count } = await supabase
      .from("project_planning_logs")
      .select("*", { count: "exact", head: true })
      .eq("project_id", project_id);

    // 4. project_planning_logs에 저장
    const { data: log, error: logError } = await supabase
      .from("project_planning_logs")
      .insert([
        {
          project_id,
          project_planning_log_sender: "ai",
          project_planning_log_message: firstQuestion,
          project_planning_log_index: count ?? 0,
        },
      ])
      .select()
      .single();

    if (logError) {
      return new Response(
        JSON.stringify({
          error: "Failed to save log",
          detail: logError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ success: true, log }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Edge Function Error]:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: error }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
