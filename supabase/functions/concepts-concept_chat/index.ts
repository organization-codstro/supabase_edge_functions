import { supabaseClient } from "../_shared/supabaseClient.ts";
import { chatCompletion } from "../_shared/openaiClient.ts";
import { buildSystemPrompt } from "./prompt.ts";

// ─── 타입 ───────────────────────────────────────────────────────────────────

interface ChatRequest {
  concept_id: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

interface Source {
  title: string;
  url: string;
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

// ─── CORS ────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── 핸들러 ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    // ── 요청 파싱 ──────────────────────────────────────────────────────────
    let body: ChatRequest;
    try {
      body = await req.json();
    } catch {
      console.error("[Validate] JSON 파싱 실패");
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const { concept_id, messages } = body;

    console.log(
      `[Request] concept_id=${concept_id}, messages=${messages?.length}`,
    );

    // ── 유효성 검사 ────────────────────────────────────────────────────────
    if (!concept_id) {
      console.error("[Validate] concept_id 누락");
      return new Response(JSON.stringify({ error: "concept_id is required" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (!messages || messages.length === 0) {
      console.error("[Validate] messages 빈 배열");
      return new Response(
        JSON.stringify({ error: "messages must not be empty" }),
        {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    // ── DB 조회 ────────────────────────────────────────────────────────────
    console.log(`[DB] 조회 시작 - concept_id=${concept_id}`);

    const { data, error: dbError } = await supabaseClient
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
      .eq("concept_id", concept_id)
      .single();

    if (dbError) {
      console.error("[DB] 쿼리 에러:", dbError.message);
      return new Response(
        JSON.stringify({ error: "DB query failed", detail: dbError.message }),
        {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    if (!data) {
      console.error("[DB] 해당 concept 없음");
      return new Response(JSON.stringify({ error: "Concept not found" }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const concept = data as ConceptRow;
    console.log(`[DB] 조회 성공 - name=${concept.concept_name}`);

    // ── 프롬프트 빌드 ──────────────────────────────────────────────────────
    const systemPrompt = buildSystemPrompt(concept);
    console.log(`[Prompt] 빌드 완료 - length=${systemPrompt.length}`);

    // ── OpenAI 호출 ────────────────────────────────────────────────────────
    console.log("[OpenAI] API 호출 시작");

    const aiMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messages,
    ];

    const completion = await chatCompletion(aiMessages);
    const rawReply = completion.choices[0]?.message?.content ?? "";
    console.log(`[OpenAI] 응답 length=${rawReply.length}`);

    // ── 응답 파싱 ──────────────────────────────────────────────────────────
    const cleaned = rawReply
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let reply: string;
    let sources: Source[] = [];
    try {
      const parsed = JSON.parse(cleaned);
      reply = parsed.reply ?? cleaned;
      sources = Array.isArray(parsed.sources) ? parsed.sources : [];
      console.log(`[Parse] JSON 파싱 성공, sources=${sources.length}개`);
    } catch {
      reply = rawReply;
      sources = [];
      console.log("[Parse] plain text 폴백");
    }

    console.log("[Response] 200 OK 반환");

    return new Response(JSON.stringify({ reply, sources }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[Fatal]", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
