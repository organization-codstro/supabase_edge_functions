import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";
import {
  CREATE_MEMORY_JOB_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} from "../_shared/config.ts";
import { responseAgent } from "./agent/agent.ts";
import buildContext from "./context.ts";

serve(async (req) => {
  try {
    const { chat_room_id, userMessage } = await req.json();

    // Context 구성
    const context = await buildContext(chat_room_id, userMessage);

    // AI 응답 생성
    const aiResponse = await responseAgent(context);

    // AI 메시지 저장 (chat_message_index는 DB trigger가 자동 생성)
    const { data, error } = await supabaseClient
      .from("chat_messages")
      .insert({
        chat_room_id,
        chat_message_sender_type: "AI",
        chat_message_content: aiResponse.chat_message_content, // string 보장
        chat_message_format: aiResponse.chat_message_format,
        chat_message_interaction_type: aiResponse.chat_message_interaction_type,
        emoticon_id: aiResponse.emoticon_id ?? null,
        chat_message_file_content_url:
          aiResponse.chat_message_file_content_url ?? null,
        chat_message_reply_message_id:
          aiResponse.chat_message_reply_message_id ?? null,
        chat_message_reply_target_agent_id:
          aiResponse.chat_message_reply_target_agent_id ?? null,
        chat_message_mention_target_agent_id:
          aiResponse.chat_message_mention_target_agent_id ?? null,
      })
      .select("chat_message_index")
      .single();

    if (error) throw error;

    const chatMessageIndex = data.chat_message_index as number;

    // 50의 배수면 memory job 생성 (비동기 fire & forget)
    if (chatMessageIndex % 50 === 0) {
      fetch(CREATE_MEMORY_JOB_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ chat_room_id }),
      }).catch((err) => {
        // memory job 실패가 AI 응답에 영향 주지 않도록 에러만 로깅
        console.error("create-memory-job call failed:", err);
      });
    }

    return new Response(JSON.stringify({ success: true, aiResponse }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);

    const errorMessage = err instanceof Error ? err.message : String(err);

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
