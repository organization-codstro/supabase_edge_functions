import { chatCompletion } from "../_shared/openaiClient.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";
import { LEVEL_TO_DIFFICULTY } from "./constant/constant.ts";
import { buildPrompt } from "./prompt/prompt.ts";
import {
  CloneCodingInsert,
  GPTGeneratedData,
  GenerateCloneCodingRequest,
  GenerateCloneCodingResponse,
  UserCloneCodingInsert,
} from "./types/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  // CORS preflight
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
    const body: GenerateCloneCodingRequest = await req.json();
    const {
      userId,
      name,
      topic,
      features,
      level,
      gitUrl,
      frameworks = [],
      libraries = [],
    } = body;

    if (!userId || !name || !topic || !features || !level) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "필수 항목이 누락되었습니다. (userId, name, topic, features, level)",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (level < 1 || level > 5) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "level은 1~5 사이의 값이어야 합니다.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ============================
    // 2. GPT 호출
    // ============================
    const prompt = buildPrompt({
      userId,
      name,
      topic,
      features,
      level,
      gitUrl,
      frameworks,
      libraries,
    });

    const completion = await chatCompletion([
      {
        role: "system",
        content:
          "당신은 클론코딩 프로젝트를 설계하는 전문 개발 교육 큐레이터입니다. 항상 지시된 JSON 형식으로만 응답합니다.",
      },
      {
        role: "user",
        content: prompt,
      },
    ]);

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) {
      throw new Error("GPT 응답이 비어있습니다.");
    }

    // ============================
    // 3. GPT 응답 파싱
    // ============================
    let gptData: GPTGeneratedData;
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
    // 4. clone_codings INSERT
    // ============================
    const cloneCodingInsert: CloneCodingInsert = {
      clone_coding_title: gptData.clone_coding_title,
      clone_coding_description: gptData.clone_coding_description,
      clone_coding_tech_stack: gptData.clone_coding_tech_stack ?? [],
      clone_coding_tags: gptData.clone_coding_tags ?? [],
      clone_coding_difficulty: LEVEL_TO_DIFFICULTY[level],
      clone_coding_estimated_hours: gptData.clone_coding_estimated_hours,
      clone_coding_steps: gptData.clone_coding_steps ?? [],
      clone_coding_project_structure:
        gptData.clone_coding_project_structure ?? null,
      clone_coding_github_url: gitUrl ?? null,
      clone_coding_thumbnail_url: null,
      clone_coding_demo_url: null,
    };

    const { data: insertedClone, error: cloneError } = await supabaseClient
      .from("clone_codings")
      .insert(cloneCodingInsert)
      .select()
      .single();

    if (cloneError) {
      throw new Error(`clone_codings 저장 실패: ${cloneError.message}`);
    }

    // ============================
    // 5. user_clone_codings INSERT
    // ============================
    const userCloneCodingInsert: UserCloneCodingInsert = {
      user_id: userId,
      clone_coding_id: insertedClone.clone_coding_id,
      user_clone_coding_status: "waiting",
      user_clone_coding_is_bookmarked: false,
    };

    const { data: insertedUserClone, error: userCloneError } =
      await supabaseClient
        .from("user_clone_codings")
        .insert(userCloneCodingInsert)
        .select()
        .single();

    if (userCloneError) {
      // clone_codings는 이미 저장됐으므로 롤백 시도
      await supabaseClient
        .from("clone_codings")
        .delete()
        .eq("clone_coding_id", insertedClone.clone_coding_id);

      throw new Error(
        `user_clone_codings 저장 실패: ${userCloneError.message}`,
      );
    }

    // ============================
    // 6. 성공 응답
    // ============================
    const response: GenerateCloneCodingResponse = {
      success: true,
      data: {
        cloneCoding: insertedClone,
        userCloneCoding: insertedUserClone,
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[clone_coding-generate] Error:", error);

    const response: GenerateCloneCodingResponse = {
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
