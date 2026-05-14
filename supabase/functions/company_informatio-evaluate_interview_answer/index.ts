import { corsHeaders } from "../_shared/cors.ts";
import { chatCompletion } from "../_shared/openaiClient.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";
import { buildEvaluationPrompt } from "./prompt/prompt.ts";
import { safeParseJson } from "../_shared/parseJson.ts";

interface EvaluationResult {
  score: number;
  strengths: string;
  improvements: string;
  betterAnswer: string;
}

async function callAI(prompt: string): Promise<string> {
  const response = await chatCompletion([
    {
      role: "system",
      content:
        "당신은 면접 코치입니다. 반드시 순수 JSON 형식으로만 응답하세요. 마크다운이나 추가 설명 없이 JSON만 반환하세요.",
    },
    { role: "user", content: prompt },
  ]);

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("AI 응답이 비어 있습니다.");
  return content;
}

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId, question, answer, companyName, userSummary } =
      await req.json();

    if (!userId || !question || !answer) {
      return new Response(JSON.stringify({ error: "필수 파라미터 누락" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = buildEvaluationPrompt(
      companyName,
      userSummary,
      question,
      answer,
    );

    const rawContent = await callAI(prompt);
    const evaluation = safeParseJson<EvaluationResult>(rawContent);

    const evaluationText = [
      `[점수: ${evaluation.score}/10]`,
      "",
      "잘한 점",
      evaluation.strengths,
      "",
      "개선할 점",
      evaluation.improvements,
      "",
      "더 나은 답변 예시",
      evaluation.betterAnswer,
    ].join("\n");

    // company_qna_id 컬럼 제거됨 — insert에서 완전히 제외
    const { data: saved, error: saveError } = await supabaseClient
      .from("company_user_qnas")
      .insert({
        user_id: userId,
        company_qna_question: question,
        company_user_qna_answer: answer,
        company_user_qna_evaluation: evaluationText,
      })
      .select()
      .single();

    if (saveError) throw new Error(`DB 저장 실패: ${saveError.message}`);

    return new Response(JSON.stringify({ evaluation, evaluationText, saved }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("답변 평가 오류:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

Deno.serve(handleRequest);
