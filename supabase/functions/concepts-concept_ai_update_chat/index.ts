/**
 * ============================================================
 * Edge Function: concepts-concept_ai_chat
 * ============================================================
 *
 * 개념(concept)에 대한 AI 챗 기능을 제공합니다.
 * conceptId로 DB에서 concept 정보를 직접 조회하여 프롬프트에 주입합니다.
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
 *   "conceptId": string,       // 조회할 concept의 UUID (필수)
 *   "messages": [              // 대화 히스토리 배열 (필수, 최소 1개)
 *     {
 *       "role": "user" | "assistant",
 *       "content": string
 *     }
 *   ]
 * }
 *
 * NOTE: messages는 매 요청마다 전체 대화 히스토리를 담아서 보내야 합니다.
 *
 * ------------------------------------------------------------
 * RESPONSE
 * ------------------------------------------------------------
 * 200 OK — 정상 응답:
 * {
 *   "reply": string,                // AI 답변 텍스트 (항상 존재)
 *   "updatedConcept": string | null // concept 수정 요청이면 전체 마크다운,
 *                                   // 단순 질문이면 null
 * }
 *
 * 400 Bad Request — 잘못된 요청:
 * { "error": string }
 *
 * 404 Not Found — concept 없음:
 * { "error": "Concept not found" }
 *
 * 500 Internal Server Error — 서버 오류:
 * { "error": string, "detail": string }
 * ============================================================
 */

import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { chatCompletion } from "../_shared/openaiClient.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";
import { buildConceptSystemPrompt } from "./prompts.ts";

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
  conceptId: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

interface ResponseBody {
  reply: string;
  updatedConcept: string | null;
}

export interface ConceptRow {
  concept_id: string;
  concept_name: string;
  concept_description: string | null;
  concept_content: string | null;
  concept_category: string[] | null;
  concept_document_url: string | null;
  concept_field: string | null;
}

// ────────────────────────────────────────────────────────────
// DB fetch helper
// ────────────────────────────────────────────────────────────

async function fetchConcept(conceptId: string): Promise<ConceptRow | null> {
  const { data, error } = await supabaseClient
    .from("concepts")
    .select(
      `
        concept_id,
        concept_name,
        concept_description,
        concept_content,
        concept_category,
        concept_document_url,
        concept_field
      `,
    )
    .eq("concept_id", conceptId)
    .single();

  if (error) {
    console.error(`[DB] Query error: ${error.message}`, error.details ?? "");
    return null;
  }

  if (!data) {
    console.warn(`[DB] No concept found. conceptId=${conceptId}`);
    return null;
  }

  return data as ConceptRow;
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

    const { conceptId, messages } = body;

    // ── 2. Validate ────────────────────────────────────────
    if (!conceptId || typeof conceptId !== "string") {
      console.warn("[Validate] Missing or invalid conceptId");
      return new Response(
        JSON.stringify({ error: "conceptId is required and must be a string" }),
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

    // ── 3. Fetch concept from DB ───────────────────────────
    const concept = await fetchConcept(conceptId);

    if (!concept) {
      return new Response(JSON.stringify({ error: "Concept not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 4. Build system prompt ─────────────────────────────
    const systemPrompt = buildConceptSystemPrompt(concept);

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
      console.warn(
        `[Parse] Failed to parse AI response as JSON. Falling back to raw text. err=${parseErr}`,
      );
      parsed = { reply: rawContent, updatedConcept: null };
    }

    // ── 7. Send response ───────────────────────────────────
    const response: ResponseBody = {
      reply: parsed.reply ?? "",
      updatedConcept: parsed.updatedConcept ?? null,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
