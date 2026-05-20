import { corsHeaders } from "../_shared/cors.ts";
import { chatCompletion } from "../_shared/openaiClient.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";
import { buildInterviewQuestionsPrompt } from "./prompt/prompt.ts";
import { safeParseJson } from "../_shared/parseJson.ts";

interface InterviewQuestion {
  question: string;
  reason: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      userId, // 과거 답변 중복 확인용 — 추가된 파라미터
      companyId,
      companyName,
      companyValues,
      companyDescription,
      companyIndustry,
      userSummary,
    } = await req.json();

    if (!userId || !companyId || !companyName || !userSummary) {
      return new Response(JSON.stringify({ error: "필수 파라미터 누락" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. 이 유저가 이 회사에서 과거에 답변했던 질문 텍스트 목록 조회
    //    → GPT 프롬프트에 넘겨서 중복 생성 방지
    const { data: pastAnswers } = await supabaseClient
      .from("company_user_qnas")
      .select("company_qna_question")
      .eq("user_id", userId);

    const pastQuestions: string[] = (pastAnswers ?? []).map(
      (r: { company_qna_question: string }) => r.company_qna_question,
    );

    // 2. 기존 질문 삭제 (같은 회사 중복 방지)
    const { error: deleteError } = await supabaseClient
      .from("company_qnas")
      .delete()
      .eq("company_id", companyId);

    if (deleteError)
      throw new Error(`기존 질문 삭제 실패: ${deleteError.message}`);

    // 3. GPT 면접 질문 생성 (과거 질문 목록 포함)
    const completion = await chatCompletion([
      {
        role: "system",
        content:
          "당신은 채용 면접 전문가입니다. 반드시 JSON 형식으로만 응답하세요. 다른 텍스트나 마크다운 없이 순수 JSON만 반환하세요.",
      },
      {
        role: "user",
        content: buildInterviewQuestionsPrompt(
          companyName,
          companyIndustry,
          companyDescription,
          companyValues,
          userSummary,
          pastQuestions,
        ),
      },
    ]);

    const rawContent = completion.choices[0].message.content ?? "{}";
    const parsed = safeParseJson<{ questions: InterviewQuestion[] }>(
      rawContent,
    );
    const questions = parsed.questions;

    if (!questions || questions.length === 0) {
      throw new Error("GPT 질문 생성 실패");
    }

    const rows = questions.map((q) => ({
      company_id: companyId,
      company_qna_question: q.question,
      company_qna_question_reason: q.reason,
    }));

    const { data: inserted, error: insertError } = await supabaseClient
      .from("company_qnas")
      .insert(rows)
      .select(
        "company_qna_id, company_qna_question, company_qna_question_reason",
      );

    if (insertError) throw new Error(`DB 저장 실패: ${insertError.message}`);

    return new Response(JSON.stringify({ questions: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
