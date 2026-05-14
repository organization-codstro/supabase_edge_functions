import { corsHeaders } from "../_shared/cors.ts";
import { chatCompletion } from "../_shared/openaiClient.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";
import { buildCompanyMatchPrompt } from "./prompt/prompt.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      userId,
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

    // GPT 매칭 분석
    const completion = await chatCompletion([
      {
        role: "user",
        content: buildCompanyMatchPrompt(
          userSummary,
          companyName,
          companyIndustry,
          companyDescription,
          companyValues,
        ),
      },
    ]);

    const aiText = completion.choices[0].message.content ?? "";

    // 파싱
    const scoreMatch = aiText.match(/SCORE:\s*(\d+)/i);
    const summaryMatch = aiText.match(/SUMMARY:\s*(.+)/i);
    const reasonMatch = aiText.match(/REASON:\s*([\s\S]*?)(?=SUGGESTIONS:|$)/i);
    const suggestionsMatch = aiText.match(/SUGGESTIONS:\s*([\s\S]*?)$/i);

    const matchRate = scoreMatch
      ? Math.min(100, Math.max(0, parseInt(scoreMatch[1])))
      : 70;
    const matchSummary = summaryMatch ? summaryMatch[1].trim() : "";
    const matchReason = reasonMatch ? reasonMatch[1].trim() : aiText;
    const matchSuggestions = suggestionsMatch ? suggestionsMatch[1].trim() : "";

    // 기존 매칭 결과 확인 (있으면 update, 없으면 insert)
    const { data: existing } = await supabaseClient
      .from("company_user_matches")
      .select("company_user_match_id")
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .single();

    if (existing) {
      const { error } = await supabaseClient
        .from("company_user_matches")
        .update({
          company_user_match_name: companyName,
          company_user_match_rate: matchRate,
          company_user_match_reason: matchReason,
          company_user_match_suggestions: matchSuggestions,
          updated_at: new Date().toISOString(),
        })
        .eq("company_user_match_id", existing.company_user_match_id);
      if (error) throw new Error(`DB 업데이트 실패: ${error.message}`);
    } else {
      const { error } = await supabaseClient
        .from("company_user_matches")
        .insert({
          user_id: userId,
          company_id: companyId,
          company_user_match_name: companyName,
          company_user_match_rate: matchRate,
          company_user_match_reason: matchReason,
          company_user_match_suggestions: matchSuggestions,
        });
      if (error) throw new Error(`DB 삽입 실패: ${error.message}`);
    }

    return new Response(
      JSON.stringify({
        matchRate,
        matchSummary,
        matchReason,
        matchSuggestions,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
