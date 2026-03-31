/**
 * ============================================================
 * Edge Function: concepts-note_ai_update_chat
 * ============================================================
 *
 * 노트에 대한 AI 챗 기능을 제공합니다.
 * noteId로 DB에서 노트 + 개념 정보를 직접 조회하여 프롬프트에 주입합니다.
 *
 * ------------------------------------------------------------
 * REQUEST
 * ------------------------------------------------------------
 * Method : POST
 * Headers:
 *   - Content-Type: application/json
 *   - Authorization: Bearer <SUPABASE_ANON_KEY>
 *
 * Body (JSON):
 * {
 *   "noteId": string,          // 조회할 노트의 UUID (필수)
 *   "messages": [              // 대화 히스토리 배열 (필수, 최소 1개)
 *     {
 *       "role": "user" | "assistant",
 *       "content": string
 *     }
 *   ]
 * }
 *
 * 예시:
 * {
 *   "noteId": "550e8400-e29b-41d4-a716-446655440000",
 *   "messages": [
 *     { "role": "user", "content": "이 노트에 설치 방법 섹션을 추가해줘" }
 *   ]
 * }
 *
 * NOTE: messages는 매 요청마다 전체 대화 히스토리를 담아서 보내야 합니다.
 *   예) 3번째 턴이라면:
 *   [
 *     { "role": "user",      "content": "첫 번째 질문" },
 *     { "role": "assistant", "content": "첫 번째 답변" },
 *     { "role": "user",      "content": "두 번째 질문" },
 *     { "role": "assistant", "content": "두 번째 답변" },
 *     { "role": "user",      "content": "지금 질문" }
 *   ]
 *
 * ------------------------------------------------------------
 * RESPONSE
 * ------------------------------------------------------------
 * 200 OK — 정상 응답:
 * {
 *   "reply": string,              // AI 답변 텍스트 (항상 존재)
 *   "updatedNote": string | null  // 노트 수정 요청이면 전체 마크다운,
 *                                 // 단순 질문이면 null
 * }
 *
 * 400 Bad Request — 잘못된 요청:
 * { "error": string }
 *
 * 404 Not Found — 노트 없음:
 * { "error": "Note not found" }
 *
 * 500 Internal Server Error — 서버 오류:
 * { "error": string, "detail": string }
 * ============================================================
 */

import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { chatCompletion } from "../_shared/openaiClient.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";
import { buildSystemPrompt } from "./prompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface RequestBody {
  noteId: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

interface ResponseBody {
  reply: string;
  updatedNote: string | null;
}

/** 각 material 테이블에서 공통으로 사용하는 필드 구조 */
export interface MaterialRow {
  name: string;
  description: string | null;
  content: string | null;
  category: string[] | null;
  document_url: string | null;
  included_language: string | null;
}

/** note_concepts 행 (정규화 후) */
export interface NoteConceptRow {
  note_concept_id: string;
  concept_description_materials: MaterialRow | null;
  tool_description_materials: MaterialRow | null;
  library_description_materials: MaterialRow | null;
  package_manager_description_materials: MaterialRow | null;
  third_party_services_description_materials: MaterialRow | null;
}

/** notes 행 (정규화 후) */
export interface NoteRow {
  note_id: string;
  note_title: string;
  note_content: string | null;
  note_description: string | null;
  note_labels: string[] | null;
  note_concepts: NoteConceptRow[];
}

// ────────────────────────────────────────────────────────────
// DB fetch helper
// ────────────────────────────────────────────────────────────

/**
 * noteId로 notes + note_concepts + 모든 materials를 한 번에 조회합니다.
 * 각 material 컬럼명의 prefix를 제거하여 공통 MaterialRow 형태로 정규화합니다.
 */
async function fetchNoteWithConcepts(noteId: string): Promise<NoteRow | null> {
  //todo : 테이블 구조 안맞아서 오류 남, 그 자료마다 테이블 구조 다른거 반영하삼요
  const { data, error } = await supabaseClient
    .from("notes")
    .select(
      `
        note_id,
note_title,
note_content,
note_description,
note_labels,
note_concepts (
    note_concept_id,
    
    concept_description_materials (
        concept_description_material_id,
        concept_description_material_name,
        concept_description_material_description,
        concept_description_material_content,
        concept_description_material_category,
        concept_description_material_document_url,
        concept_description_material_image_url,
        concept_description_material_image_urls,
        created_at,
        updated_at
    ),
    
    tool_description_materials (
        tool_description_material_id,
        tool_description_material_name,
        tool_description_material_description,
        tool_description_material_content,
        tool_description_material_category,
        tool_description_material_document_url,
        tool_description_material_image_url,
        tool_description_material_image_urls,
        created_at,
        updated_at
    ),
    
    library_description_materials (
        library_description_material_id,
        library_description_material_name,
        library_description_material_description,
        library_description_material_content,
        library_description_material_category,
        library_description_material_document_url,
        library_description_material_included_language,
        library_description_material_image_url,
        library_description_material_image_urls,
        created_at,
        updated_at
    ),
    
    package_manager_description_materials (
        package_manager_description_material_id,
        package_manager_description_material_name,
        package_manager_description_material_description,
        package_manager_description_material_content,
        package_manager_description_material_category,
        package_manager_description_material_document_url,
        package_manager_description_material_image_url,
        package_manager_description_material_image_urls,
        created_at,
        updated_at
    ),
    
    third_party_services_description_materials (
        third_party_services_description_material_id,
        third_party_services_description_material_name,
        third_party_services_description_material_description,
        third_party_services_description_material_content,
        third_party_services_description_material_category,
        third_party_services_description_material_document_url,
        third_party_services_description_material_image,
        third_party_services_description_material_image_url,
        created_at,
        updated_at
    )
)
    `,
    )
    .eq("note_id", noteId)
    .single();

  if (error) {
    console.error(`[DB] Query error: ${error.message}`, error.details ?? "");
    return null;
  }

  if (!data) {
    console.warn(`[DB] No note found. noteId=${noteId}`);
    return null;
  }

  // material 컬럼명 prefix를 제거하여 공통 MaterialRow로 변환
  const normalize = (
    raw: Record<string, unknown> | null,
    prefix: string,
  ): MaterialRow | null => {
    if (!raw) return null;
    return {
      name: raw[`${prefix}_name`] as string,
      description: (raw[`${prefix}_description`] as string) ?? null,
      content: (raw[`${prefix}_content`] as string) ?? null,
      category: (raw[`${prefix}_category`] as string[]) ?? null,
      document_url: (raw[`${prefix}_document_url`] as string) ?? null,
      included_language: (raw[`${prefix}_included_language`] as string) ?? null,
    };
  };

  const note = data as Record<string, unknown>;
  const rawConcepts = (note.note_concepts ?? []) as Record<string, unknown>[];

  const normalizedConcepts: NoteConceptRow[] = rawConcepts.map((c) => ({
    note_concept_id: c.note_concept_id as string,
    concept_description_materials: normalize(
      c.concept_description_materials as Record<string, unknown> | null,
      "concept_description_material",
    ),
    tool_description_materials: normalize(
      c.tool_description_materials as Record<string, unknown> | null,
      "tool_description_material",
    ),
    library_description_materials: normalize(
      c.library_description_materials as Record<string, unknown> | null,
      "library_description_material",
    ),
    package_manager_description_materials: normalize(
      c.package_manager_description_materials as Record<string, unknown> | null,
      "package_manager_description_material",
    ),
    third_party_services_description_materials: normalize(
      c.third_party_services_description_materials as Record<
        string,
        unknown
      > | null,
      "third_party_services_description_material",
    ),
  }));

  return {
    note_id: note.note_id as string,
    note_title: note.note_title as string,
    note_content: (note.note_content as string) ?? null,
    note_description: (note.note_description as string) ?? null,
    note_labels: (note.note_labels as string[]) ?? null,
    note_concepts: normalizedConcepts,
  };
}

// ────────────────────────────────────────────────────────────
// Main handler
// ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    console.warn(`[Request] Method not allowed: ${req.method}`);
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // ── 1. Parse body ──────────────────────────────────────
    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      console.error("[Request] Failed to parse JSON body");
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { noteId, messages } = body;

    // ── 2. Validate ────────────────────────────────────────
    if (!noteId || typeof noteId !== "string") {
      console.warn("[Validate] Missing or invalid noteId");
      return new Response(
        JSON.stringify({ error: "noteId is required and must be a string" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.warn("[Validate] Missing or empty messages array");
      return new Response(
        JSON.stringify({
          error: "messages is required and must be a non-empty array",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── 3. Fetch note + concepts from DB ───────────────────
    const note = await fetchNoteWithConcepts(noteId);

    if (!note) {
      return new Response(JSON.stringify({ error: "Note not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 4. Build system prompt ─────────────────────────────
    const systemPrompt = buildSystemPrompt(note);

    // ── 5. Call OpenAI ─────────────────────────────────────
    const openaiMessages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const completion = await chatCompletion(openaiMessages);
    const rawContent = completion.choices[0]?.message?.content ?? "";

    // ── 6. Parse AI JSON response ──────────────────────────
    let parsed: ResponseBody;
    try {
      const cleaned = rawContent
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();

      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      // JSON 파싱 실패 시 raw 텍스트를 reply로 폴백
      console.warn(
        `[Parse] Failed to parse AI response as JSON. Falling back to raw text. err=${parseErr}`,
      );
      parsed = { reply: rawContent, updatedNote: null };
    }

    // ── 7. Send response ───────────────────────────────────
    const response: ResponseBody = {
      reply: parsed.reply ?? "",
      updatedNote: parsed.updatedNote ?? null,
    };

    const httpResponse = new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    return httpResponse;
  } catch (err) {
    console.error("[Fatal] Unhandled exception:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
