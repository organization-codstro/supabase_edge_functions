import { supabaseClient } from "../_shared/supabaseClient.ts";
import { chatCompletion } from "../_shared/openaiClient.ts";
import { buildSystemPrompt } from "./prompt.ts";

// ─── 타입 ───────────────────────────────────────────────────────────────────

type MATERIAL_TYPE =
  | "concept"
  | "tool"
  | "library"
  | "thirdPartyService"
  | "packageManager";

interface ChatRequest {
  material_id: string;
  material_type: MATERIAL_TYPE;
  messages: { role: "user" | "assistant"; content: string }[];
}

// ─── 테이블 매핑 ─────────────────────────────────────────────────────────────

const TABLE_MAP: Record<MATERIAL_TYPE, { table: string; prefix: string }> = {
  concept: {
    table: "concept_description_materials",
    prefix: "concept_description_material",
  },
  tool: {
    table: "tool_description_materials",
    prefix: "tool_description_material",
  },
  library: {
    table: "library_description_materials",
    prefix: "library_description_material",
  },
  thirdPartyService: {
    table: "third_party_services_description_materials",
    prefix: "third_party_services_description_material",
  },
  packageManager: {
    table: "package_manager_description_materials",
    prefix: "package_manager_description_material",
  },
};

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

    const { material_id, material_type, messages } = body;

    console.log(
      `[Request] material_id=${material_id}, type=${material_type}, messages=${messages?.length}`,
    );

    // ── 유효성 검사 ────────────────────────────────────────────────────────
    if (!material_id || !material_type) {
      console.error("[Validate] material_id 또는 material_type 누락");
      return new Response(
        JSON.stringify({ error: "material_id and material_type are required" }),
        {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
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

    if (!TABLE_MAP[material_type]) {
      console.error(`[Validate] 알 수 없는 material_type: ${material_type}`);
      return new Response(
        JSON.stringify({ error: `Unknown material_type: ${material_type}` }),
        {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    // ── DB 조회 ────────────────────────────────────────────────────────────
    const { table, prefix } = TABLE_MAP[material_type];

    console.log(`[DB] 조회 시작 - table=${table}, id=${material_id}`);

    const { data, error: dbError } = await supabaseClient
      .from(table)
      .select("*")
      .eq(`${prefix}_id`, material_id)
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
      console.error("[DB] 해당 material 없음");
      return new Response(JSON.stringify({ error: "Material not found" }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // prefix 걷어내고 정규화 (unknown 경유로 안전하게 캐스팅)
    const row = data as unknown as Record<string, string>;
    const material = {
      name: row[`${prefix}_name`],
      description: row[`${prefix}_description`],
      content: row[`${prefix}_content`],
      type: material_type,
    };

    console.log(`[DB] 조회 성공 - name=${material.name}`);

    // ── 프롬프트 빌드 ──────────────────────────────────────────────────────
    const systemPrompt = buildSystemPrompt(material);
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
    // AI가 간혹 ```json 펜스로 감싸는 경우 대비
    const cleaned = rawReply
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let reply: string;
    try {
      const parsed = JSON.parse(cleaned);
      reply = parsed.reply ?? cleaned;
      console.log("[Parse] JSON 파싱 성공");
    } catch {
      // JSON이 아닌 plain text로 왔을 때 그대로 사용
      reply = rawReply;
      console.log("[Parse] plain text 폴백");
    }

    console.log("[Response] 200 OK 반환");

    return new Response(JSON.stringify({ reply }), {
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
