import { chatCompletion } from "../_shared/openaiClient.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";
import { buildStudyPlanPrompt } from "./prompt/prompt.ts";
import {
  GenerateStudyPlanRequest,
  GenerateStudyPlanResponse,
  GPTGeneratedStudyPlan,
  StudyPlanInsert,
  StudyPlanNodeInsert,
} from "./types/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    // ============================
    // 1. 요청 파싱 및 검증
    // ============================
    const body: GenerateStudyPlanRequest = await req.json();
    const {
      userId,
      name,
      description,
      goal,
      currentLevel,
      maxHours,
      learningStyle,
      expectedOutput,
      startDate,
      endDate,
      techStacks,
    } = body;

    if (
      !userId ||
      !name ||
      !description ||
      !goal ||
      !learningStyle ||
      !expectedOutput ||
      !startDate ||
      !endDate
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "필수 항목 누락 (userId, name, description, goal, learningStyle, expectedOutput, startDate, endDate)",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ============================
    // 2. tech_stacks 테이블에서 태그로 id 조회
    // ============================
    const techStackMap = new Map<string, string>(); // name → id

    if (techStacks.length > 0) {
      // 유저가 입력한 기술 스택을 소문자 태그로 변환
      const normalizedTags = techStacks.map((t) => t.toLowerCase().trim());

      // tags 배열에 하나라도 겹치는 tech_stack 전체 조회
      // Supabase: overlaps → tags 배열과 normalizedTags 배열이 겹치는 row 반환
      const { data: techStackRows, error: techStackError } =
        await supabaseClient
          .from("tech_stacks")
          .select("tech_stack_id, tech_stack_name, tags")
          .overlaps("tags", normalizedTags);

      if (techStackError) {
        throw new Error(`tech_stacks 조회 실패: ${techStackError.message}`);
      }

      // tech_stack_name(소문자) → id, tags 각 항목 → id 모두 매핑
      techStackRows?.forEach(
        (row: {
          tech_stack_id: string;
          tech_stack_name: string;
          tags: string[];
        }) => {
          // 이름으로도 조회 가능하게
          techStackMap.set(
            row.tech_stack_name.toLowerCase(),
            row.tech_stack_id,
          );
          // 태그 각각으로도 조회 가능하게
          row.tags?.forEach((tag) => {
            techStackMap.set(tag.toLowerCase(), row.tech_stack_id);
          });
        },
      );
    }

    // ============================
    // 3. GPT 호출
    // ============================
    const prompt = buildStudyPlanPrompt(body);

    const completion = await chatCompletion([
      {
        role: "system",
        content:
          "당신은 개인 맞춤형 학습 계획을 설계하는 전문 교육 컨설턴트입니다. 항상 지시된 JSON 형식으로만 응답합니다.",
      },
      {
        role: "user",
        content: prompt,
      },
    ]);

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) throw new Error("GPT 응답이 비어있습니다.");

    // ============================
    // 4. GPT 응답 파싱
    // ============================
    let gptData: GPTGeneratedStudyPlan;
    try {
      const cleaned = rawContent
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      gptData = JSON.parse(cleaned);
    } catch {
      throw new Error(`GPT 응답 JSON 파싱 실패: ${rawContent}`);
    }

    // ============================
    // 5. study_plans INSERT
    // ============================
    const studyPlanInsert: StudyPlanInsert = {
      user_id: userId,
      study_plan_name: name,
      study_plan_description: gptData.study_plan_description,
      study_plan_start_date: startDate,
      study_plan_end_date: endDate,
      study_plan_state: "waiting",
      study_plan_is_recommendation: false,
    };

    const { data: insertedPlan, error: planError } = await supabaseClient
      .from("study_plans")
      .insert(studyPlanInsert)
      .select()
      .single();

    if (planError)
      throw new Error(`study_plans 저장 실패: ${planError.message}`);

    // ============================
    // 6. study_plan_nodes INSERT
    // tech_stack_id를 찾지 못한 노드는 스킵 처리
    // ============================
    const nodeInserts: StudyPlanNodeInsert[] = [];
    const skippedNodes: string[] = [];

    for (const node of gptData.nodes) {
      const techStackId = techStackMap.get(node.tech_stack_name.toLowerCase());

      if (!techStackId) {
        console.warn(
          `[study_plan-generate] tech_stack not found: ${node.tech_stack_name}`,
        );
        skippedNodes.push(node.study_plan_node_name);
        continue;
      }

      nodeInserts.push({
        study_plan_id: insertedPlan.study_plan_id,
        tech_stack_id: techStackId,
        study_plan_node_name: node.study_plan_node_name,
        study_plan_node_description: node.study_plan_node_description,
        study_plan_node_start_date: node.study_plan_node_start_date,
        study_plan_node_end_date: node.study_plan_node_end_date,
        study_plan_node_position: node.study_plan_node_position,
        study_plan_node_completed: false,
      });
    }

    let insertedNodes: StudyPlanNodeInsert[] = [];
    if (nodeInserts.length > 0) {
      const { data: nodesData, error: nodesError } = await supabaseClient
        .from("study_plan_nodes")
        .insert(nodeInserts)
        .select();

      if (nodesError) {
        // 노드 실패 시 study_plan 롤백
        await supabaseClient
          .from("study_plans")
          .delete()
          .eq("study_plan_id", insertedPlan.study_plan_id);

        throw new Error(`study_plan_nodes 저장 실패: ${nodesError.message}`);
      }

      insertedNodes = nodesData ?? [];
    }

    // ============================
    // 7. 성공 응답
    // ============================
    const response: GenerateStudyPlanResponse = {
      success: true,
      data: {
        studyPlan: insertedPlan,
        nodes: insertedNodes,
        skippedNodes,
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[study_plan-generate] Error:", error);

    const response: GenerateStudyPlanResponse = {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "알 수 없는 오류가 발생했습니다.",
    };

    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
