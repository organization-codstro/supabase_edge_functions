import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletion } from "../_shared/openaiClient.ts";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

interface PlanningLog {
  project_planning_log_index: number;
  project_planning_log_sender: string;
  project_planning_log_message: string;
}

interface ProjectPlanningData {
  project_name: string;
  project_description: string;
  project_topic: string;
  project_stacks: string;
  project_start_date: string; // YYYY-MM-DD
  project_end_date: string; // YYYY-MM-DD
  project_main_color: string;
  project_style: string;
  project_effect: string;
}

interface ProjectPage {
  project_page_name: string;
  project_page_role: string;
  project_page_function: string;
  project_page_is_complete: boolean;
}

interface Todo {
  todo_name: string;
  todo_content: string;
  todo_description: string;
  todo_start_date: string; // YYYY-MM-DD
  todo_end_date: string; // YYYY-MM-DD
  todo_status: string;
}

interface AiAnalysisResult {
  planning: ProjectPlanningData;
  pages: ProjectPage[];
  todos: Todo[];
}

// ────────────────────────────────────────────
// Main Handler
// ────────────────────────────────────────────

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

    // ── Supabase client (service role for DB write) ──
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── 1. project_planning_logs 조회 ──
    const { data: logs, error: logsError } = await supabase
      .from("project_planning_logs")
      .select(
        "project_planning_log_index, project_planning_log_sender, project_planning_log_message",
      )
      .eq("project_id", project_id)
      .order("project_planning_log_index", { ascending: true });

    if (logsError) throw new Error(`Logs fetch error: ${logsError.message}`);
    if (!logs || logs.length === 0) {
      return new Response(
        JSON.stringify({ error: "No planning logs found for this project" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── 2. 대화 내용을 Claude API 형식으로 변환 ──
    const conversationText = (logs as PlanningLog[])
      .map(
        (log) =>
          `[${log.project_planning_log_sender}]: ${log.project_planning_log_message}`,
      )
      .join("\n");

    // ── 3. Claude API로 기획 정보 추출 ──
    const analysisResult = await analyzeWithOpenAI(conversationText);

    // ── 4. project_plannings UPDATE ──
    const { error: updateError } = await supabase
      .from("project_plannings")
      .update({
        project_name: analysisResult.planning.project_name,
        project_description: analysisResult.planning.project_description,
        project_topic: analysisResult.planning.project_topic,
        project_stacks: analysisResult.planning.project_stacks,
        project_start_date: analysisResult.planning.project_start_date,
        project_end_date: analysisResult.planning.project_end_date,
        project_main_color: analysisResult.planning.project_main_color,
        project_style: analysisResult.planning.project_style,
        project_effect: analysisResult.planning.project_effect,
        project_planning_stage: "planning", // chat → planning 단계로 전진
        updated_at: new Date().toISOString(),
      })
      .eq("project_id", project_id);

    if (updateError)
      throw new Error(`Planning update error: ${updateError.message}`);

    // ── 5. project_planning_pages INSERT ──
    if (analysisResult.pages.length > 0) {
      const pagesToInsert = analysisResult.pages.map((page) => ({
        project_page_name: page.project_page_name,
        project_page_role: page.project_page_role,
        project_page_function: page.project_page_function,
        project_page_is_complete: false,
        project_id: project_id,
      }));

      const { error: pagesError } = await supabase
        .from("project_planning_pages")
        .insert(pagesToInsert);

      if (pagesError)
        throw new Error(`Pages insert error: ${pagesError.message}`);
    }

    // ── 6. todos는 DB 저장 없이 반환 (유저 확인 후 저장) ──
    return new Response(
      JSON.stringify({
        success: true,
        todos: analysisResult.todos, // id 없이 내용만 반환
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Edge Function error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ────────────────────────────────────────────
// OpenAI 분석 함수
// ────────────────────────────────────────────

async function analyzeWithOpenAI(
  conversationText: string,
): Promise<AiAnalysisResult> {
  const today = new Date().toISOString().split("T")[0];

  const prompt = `당신은 프로젝트 기획 전문가입니다.
아래는 사용자와 AI가 나눈 프로젝트 기획 대화입니다.
이 대화를 분석해서 반드시 아래 JSON 형식으로만 응답하세요. JSON 외 다른 텍스트는 절대 포함하지 마세요.

오늘 날짜: ${today}

대화 내용:
${conversationText}

응답 JSON 형식:
{
  "planning": {
    "project_name": "프로젝트 이름 (대화에서 언급된 이름, 없으면 주제로 유추)",
    "project_description": "프로젝트 전체 설명 (2~3문장)",
    "project_topic": "프로젝트 핵심 주제/카테고리 (예: 쇼핑몰, 포트폴리오, 사내툴 등)",
    "project_stacks": "사용 기술스택 (예: React, Next.js, Supabase, TypeScript)",
    "project_start_date": "YYYY-MM-DD (대화에서 언급 없으면 오늘 날짜)",
    "project_end_date": "YYYY-MM-DD (대화에서 언급 없으면 start_date + 30일)",
    "project_main_color": "메인 컬러 hex코드 (예: #3B82F6, 언급 없으면 프로젝트 성격에 맞게 추천)",
    "project_style": "UI 스타일 (예: 모던, 미니멀, 다크, 컬러풀 등)",
    "project_effect": "주요 효과/애니메이션 (예: 부드러운 트랜지션, 호버 효과 등, 언급 없으면 '기본')"
  },
  "pages": [
    {
      "project_page_name": "페이지 이름",
      "project_page_role": "역할",
      "project_page_function": "기능 목록"
    }
  ],
  "todos": [
    {
      "todo_name": "할일 제목",
      "todo_content": "할일 상세 내용",
      "todo_description": "설명",
      "todo_start_date": "YYYY-MM-DD",
      "todo_end_date": "YYYY-MM-DD",
      "todo_status": "todo"
    }
  ]
}

규칙:
- pages 최소 1개, 최대 15개
- todos 최소 5개, 최대 20개
- 날짜는 project 범위 내
- todo_status는 항상 "waiting"
- todos 생성시 todo의 todo_name은 [프로젝트 이름 - 할일]로 적어주세요
`;

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: "You must respond ONLY with valid JSON.",
    },
    {
      role: "user",
      content: prompt,
    },
  ];

  const response = await chatCompletion(messages);

  const rawText = response.choices[0]?.message?.content ?? "";

  // 코드블록 제거
  const cleaned = rawText.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(cleaned) as AiAnalysisResult;
  } catch {
    throw new Error(`Failed to parse OpenAI response as JSON: ${cleaned}`);
  }
}
