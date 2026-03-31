import { chatCompletion } from "../_shared/openaiClient.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";
import { buildNotePrompt } from "./prompts.ts";

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
    const { note_id, user_id, title, description, prompt, concepts, labels } =
      await req.json();

    const supabase = supabaseClient;

    // 1. 개념 fetch
    const conceptContents: string[] = [];

    for (const concept of concepts) {
      if (concept.type === "concept") {
        const { data } = await supabase
          .from("concept_description_materials")
          .select(
            "concept_description_material_name, concept_description_material_description, concept_description_material_content",
          )
          .eq("concept_description_material_id", concept.id)
          .single();

        if (data) {
          conceptContents.push(
            `[개념: ${data.concept_description_material_name}]\n${data.concept_description_material_description}\n${data.concept_description_material_content}`,
          );
        }
      } else if (concept.type === "tool") {
        const { data } = await supabase
          .from("tool_description_materials")
          .select(
            "tool_description_material_name, tool_description_material_description, tool_description_material_content",
          )
          .eq("tool_description_material_id", concept.id)
          .single();

        if (data) {
          conceptContents.push(
            `[도구: ${data.tool_description_material_name}]\n${data.tool_description_material_description}\n${data.tool_description_material_content}`,
          );
        }
      } else if (concept.type === "library") {
        const { data } = await supabase
          .from("library_description_materials")
          .select(
            "library_description_material_name, library_description_material_description, library_description_material_content",
          )
          .eq("library_description_material_id", concept.id)
          .single();

        if (data) {
          conceptContents.push(
            `[라이브러리: ${data.library_description_material_name}]\n${data.library_description_material_description}\n${data.library_description_material_content}`,
          );
        }
      } else if (concept.type === "packageManager") {
        const { data } = await supabase
          .from("package_manager_description_materials")
          .select(
            "package_manager_description_material_name, package_manager_description_material_description, package_manager_description_material_content",
          )
          .eq("package_manager_description_material_id", concept.id)
          .single();

        if (data) {
          conceptContents.push(
            `[패키지 매니저: ${data.package_manager_description_material_name}]\n${data.package_manager_description_material_description}\n${data.package_manager_description_material_content}`,
          );
        }
      } else if (concept.type === "thirdPartyService") {
        const { data } = await supabase
          .from("third_party_services_description_materials")
          .select(
            "third_party_services_description_material_name, third_party_services_description_material_description, third_party_services_description_material_content",
          )
          .eq("third_party_services_description_material_id", concept.id)
          .single();

        if (data) {
          conceptContents.push(
            `[서드파티 서비스: ${data.third_party_services_description_material_name}]\n${data.third_party_services_description_material_description}\n${data.third_party_services_description_material_content}`,
          );
        }
      }
    }

    // 2. 프롬프트 생성
    const { system, user } = buildNotePrompt({
      title,
      description,
      prompt,
      labels,
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
      .from("notes")
      .update({
        note_content: aiContent,
        updated_at: new Date().toISOString(),
      })
      .eq("note_id", note_id)
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
