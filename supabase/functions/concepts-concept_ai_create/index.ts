// index.ts
import { chatCompletion } from "../_shared/openaiClient.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";
import { buildConceptPrompt } from "./prompts.ts";

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
    const {
      concept_id,
      user_id,
      title,
      description,
      prompt,
      concepts, // 프론트에서 [{ id }] 형태로 전달
      categories, // concept_category
    } = await req.json();

    const supabase = supabaseClient;

    // 1. 연관 개념 fetch
    const conceptContents: string[] = [];
    const concept_ids = (concepts ?? []).map((c: { id: string }) => c.id);

    if (concept_ids.length > 0) {
      const { data, error } = await supabase
        .from("concepts")
        .select(
          "concept_name, concept_description, concept_content, concept_field",
        )
        .in("concept_id", concept_ids);

      if (error) throw error;

      for (const concept of data ?? []) {
        const field = concept.concept_field
          ? `[${concept.concept_field}] `
          : "";
        conceptContents.push(
          `${field}${concept.concept_name}\n${concept.concept_description ?? ""}\n${concept.concept_content ?? ""}`.trim(),
        );
      }
    }

    // 2. 프롬프트 생성
    const { system, user } = buildConceptPrompt({
      title,
      description,
      prompt,
      categories,
      conceptContents,
    });

    // 3. GPT 호출
    const completion = await chatCompletion([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);

    const aiContent = completion.choices[0].message.content ?? "";

    // 4. DB 업데이트
    const { error } = await supabase
      .from("concepts")
      .update({
        concept_content: aiContent,
        updated_at: new Date().toISOString(),
      })
      .eq("concept_id", concept_id)
      .eq("user_id", user_id);

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, content: aiContent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
