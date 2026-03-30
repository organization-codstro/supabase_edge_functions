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

const toUuid = (val: string): string | null => val?.trim() || null;
const toArray = (val: string[]): string[] | null =>
  val?.length > 0 ? val : null;

async function broadcast(chat_room_id: string, payload: object) {
  await supabaseClient
    .channel(`room_typing_${chat_room_id}`)
    .httpSend("typing", payload);
}

async function validateEmoticonId(
  emoticonId: string | null,
): Promise<string | null> {
  if (!emoticonId) return null;
  const { data } = await supabaseClient
    .from("emoticons")
    .select("emoticon_id")
    .eq("emoticon_id", emoticonId)
    .maybeSingle();
  if (!data)
    console.warn(`[ai-chat] emoticon_id ${emoticonId} not found → null`);
  return data ? emoticonId : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { chat_room_id, userMessage } = await req.json();

    const context = await buildContext(chat_room_id, userMessage);

    console.log("[ai-chat] context personas:", context);

    console.log(
      "[ai-chat] context personas:",
      context.personas.map((p) => p.baseInfo.ai_persona_name),
    );

    // 타이핑 시작 브로드캐스트
    await broadcast(chat_room_id, {
      type: "typing_start",
      personas: context.personas.map((p) => ({
        chat_room_ai_id: p.chat_room_ai_id,
        persona_name: p.baseInfo.ai_persona_name,
      })),
    });

    const results = await Promise.allSettled(
      context.personas.map((persona) => responseAgent(context, persona)),
    );

    let lastMessageIndex = 0;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const persona = context.personas[i];

      if (result.status === "rejected") {
        console.error(
          `[ai-chat] ${persona.baseInfo.ai_persona_name} 응답 실패:`,
          result.reason,
        );
        // 실패한 페르소나도 타이핑 종료 브로드캐스트
        await broadcast(chat_room_id, {
          type: "typing_end",
          chat_room_ai_id: persona.chat_room_ai_id,
        });
        continue;
      }

      const aiResponse = result.value;
      const validatedEmoticonId = await validateEmoticonId(
        toUuid(aiResponse.emoticon_id),
      );

      const { data, error } = await supabaseClient
        .from("chat_messages")
        .insert({
          chat_room_id,
          chat_message_sender_type: "AI",
          chat_message_sender_agent_id: persona.chat_room_ai_id,
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
        console.error(
          `[ai-chat] ${persona.baseInfo.ai_persona_name} 저장 실패:`,
          error,
        );
        await broadcast(chat_room_id, {
          type: "typing_end",
          chat_room_ai_id: persona.chat_room_ai_id,
        });
        continue;
      }

      lastMessageIndex = data.chat_message_index as number;

      // 타이핑 종료 브로드캐스트
      await broadcast(chat_room_id, {
        type: "typing_end",
        chat_room_ai_id: persona.chat_room_ai_id,
      });

      console.log(
        `[ai-chat] ${persona.baseInfo.ai_persona_name} 저장 완료 (index: ${lastMessageIndex})`,
      );
    }

    if (lastMessageIndex > 0 && lastMessageIndex % 50 === 0) {
      fetch(CREATE_MEMORY_JOB_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ chat_room_id }),
      }).catch((err) => console.error("create-memory-job call failed:", err));
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
