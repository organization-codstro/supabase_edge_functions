import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";
import {
  CREATE_MEMORY_JOB_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} from "../_shared/config.ts";
import { responseAgent } from "./agent/agent.ts";
import buildContext from "./context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// 빈 문자열 → null 변환
const toUuid = (val: string): string | null => val?.trim() || null;
const toArray = (val: string[]): string[] | null =>
  val?.length > 0 ? val : null;

// emoticon_id가 실제 DB에 존재하는지 검증
async function validateEmoticonId(
  emoticonId: string | null,
): Promise<string | null> {
  if (!emoticonId) return null;

  const { data } = await supabaseClient
    .from("emoticons")
    .select("emoticon_id")
    .eq("emoticon_id", emoticonId)
    .maybeSingle();

  if (!data) {
    console.warn(
      `[ai-chat] emoticon_id ${emoticonId} not found in DB → null로 처리`,
    );
  }

  return data ? emoticonId : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { chat_room_id, userMessage } = await req.json();

    // Context 구성
    const context = await buildContext(chat_room_id, userMessage);

    console.log(
      "[ai-chat] context personas:",
      context.personas.map((p) => p.baseInfo.ai_persona_name),
    );

    // 각 페르소나별로 병렬 응답 생성
    const results = await Promise.allSettled(
      context.personas.map((persona) => responseAgent(context, persona)),
    );

    // 각 페르소나 응답 개별 저장 + 마지막 index 추적 (memory job용)
    let lastMessageIndex = 0;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const persona = context.personas[i];

      if (result.status === "rejected") {
        console.error(
          `[ai-chat] ${persona.baseInfo.ai_persona_name} 응답 실패:`,
          result.reason,
        );
        continue;
      }

      const aiResponse = result.value;

      // emoticon_id DB 존재 여부 검증
      const validatedEmoticonId = await validateEmoticonId(
        toUuid(aiResponse.emoticon_id),
      );

      const { data, error } = await supabaseClient
        .from("chat_messages")
        .insert({
          chat_room_id,
          chat_message_sender_type: "AI",
          chat_message_sender_agent_id: persona.baseInfo.ai_persona_id,
          chat_message_content: aiResponse.chat_message_content,
          chat_message_format: aiResponse.chat_message_format,
          chat_message_interaction_type:
            aiResponse.chat_message_interaction_type,
          emoticon_id: validatedEmoticonId,
          chat_message_file_content_path: toArray(
            aiResponse.chat_message_file_content_path,
          ),
          chat_message_reply_message_id: toUuid(
            aiResponse.chat_message_reply_message_id,
          ),
          chat_message_reply_target_agent_id: toUuid(
            aiResponse.chat_message_reply_target_agent_id,
          ),
          chat_message_mention_target_agent_id: toUuid(
            aiResponse.chat_message_mention_target_agent_id,
          ),
        })
        .select("chat_message_index")
        .single();

      if (error) {
        if (error) {
          console.log(
            "❌ chat insert error",
            chat_room_id,
            "AI",
            persona.baseInfo.ai_persona_id,
            aiResponse.chat_message_content,
            aiResponse.chat_message_format,
            aiResponse.chat_message_interaction_type,
            validatedEmoticonId,
            toArray(aiResponse.chat_message_file_content_path),
            toUuid(aiResponse.chat_message_reply_message_id),
            toUuid(aiResponse.chat_message_reply_target_agent_id),
            toUuid(aiResponse.chat_message_mention_target_agent_id),
            error.message,
          );
        }
        console.error(
          `[ai-chat] ${persona.baseInfo.ai_persona_name} 저장 실패:`,
          error,
        );
        continue;
      }

      lastMessageIndex = data.chat_message_index as number;

      console.log(
        `[ai-chat] ${persona.baseInfo.ai_persona_name} 저장 완료 (index: ${lastMessageIndex})`,
      );
    }

    // 마지막 저장된 index가 50의 배수면 memory job 생성
    if (lastMessageIndex > 0 && lastMessageIndex % 50 === 0) {
      fetch(CREATE_MEMORY_JOB_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ chat_room_id }),
      }).catch((err) => {
        console.error("create-memory-job call failed:", err);
      });
    }

    return new Response(
      JSON.stringify({ success: true, count: results.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
