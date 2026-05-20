// index.ts

import { supabaseClient } from "../_shared/supabaseClient.ts";
import { SERVICE_ROLE_KEY } from "../_shared/config.ts";
import { responseAgent } from "./agent/agent.ts";
import buildContext from "./context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const toUuid = (val: string | null | undefined): string | null =>
  val?.trim() || null;

const toArray = (val: string[] | null | undefined): string[] | null =>
  val?.length ? val : null;

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

  if (!data) {
    console.warn(`[ai-chat] emoticon_id ${emoticonId} not found → null`);
  }

  return data ? emoticonId : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { chat_room_id, userMessage } = await req.json();

    const context = await buildContext(chat_room_id, userMessage);

    console.log(
      "[ai-chat] personas:",
      context.personas.map((p) => p.baseInfo.ai_persona_name),
    );

    const targetAgentId = userMessage.chat_message_mention_target_agent_id;

    console.log("[ai-chat] targetAgentId:", targetAgentId);
    console.log(
      "[ai-chat] persona ids:",
      context.personas.map((p) => ({
        chat_room_ai_id: p.chat_room_ai_id,
        ai_persona_id: p.baseInfo.ai_persona_id,
      })),
    );

    const respondingPersonas = targetAgentId
      ? context.personas.filter((p) => p.chat_room_ai_id === targetAgentId)
      : context.personas;

    console.log(
      "[ai-chat] responding personas:",
      respondingPersonas.map((p) => p.baseInfo.ai_persona_name),
    );

    await broadcast(chat_room_id, {
      type: "typing_start",
      personas: respondingPersonas.map((p) => ({
        chat_room_ai_id: p.chat_room_ai_id,
        persona_name: p.baseInfo.ai_persona_name,
      })),
    });

    const results = await Promise.allSettled(
      respondingPersonas.map((persona) => responseAgent(context, persona)),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const persona = respondingPersonas[i];

      if (result.status === "rejected") {
        console.error(
          `[ai-chat] ${persona.baseInfo.ai_persona_name} 응답 실패:`,
          result.reason,
        );

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

      if (!aiResponse.chat_message_content && !validatedEmoticonId) {
        console.error(
          `[ai-chat] ${persona.baseInfo.ai_persona_name} 응답 내용과 이모지 모두 비어있음 → 저장 스킵`,
        );
        await broadcast(chat_room_id, {
          type: "typing_end",
          chat_room_ai_id: persona.chat_room_ai_id,
        });
        continue;
      }

      const { data, error } = await supabaseClient
        .from("chat_messages")
        .insert({
          chat_room_id,
          chat_message_sender_type: "AI",
          chat_message_sender_agent_id: persona.chat_room_ai_id,
          chat_message_content: aiResponse.chat_message_content,
          chat_message_format: validatedEmoticonId ? "IMG" : "TEXT",
          chat_message_interaction_type:
            aiResponse.chat_message_interaction_type || "CASUAL",
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

      const lastMessageIndex = data.chat_message_index as number;
      console.log("현제 진행중인 index : ", lastMessageIndex);

      await broadcast(chat_room_id, {
        type: "typing_end",
        chat_room_ai_id: persona.chat_room_ai_id,
      });

      console.log(
        `[ai-chat] ${persona.baseInfo.ai_persona_name} 저장 완료 (index: ${lastMessageIndex})`,
      );

      if (lastMessageIndex > 0 && lastMessageIndex % 50 === 0) {
        console.log("ai_chat-create_chat_memory_job 호출");
        fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai_chat-create_chat_memory_job`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ chat_room_id }),
          },
        ).catch((err) => console.error("create-memory-job call failed:", err));
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        count: respondingPersonas.length,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    console.error(err);

    const errorMessage = err instanceof Error ? err.message : String(err);

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }
});
