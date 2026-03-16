// ai-chat/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";
import { responseAgent } from "./agent/agent.ts";
import buildContext from "../_shared/context.ts";

serve(async (req) => {
  try {
    const { chat_room_id, userMessage } = await req.json();

    // Context 구성
    const context = await buildContext(chat_room_id, userMessage);

    // AI 응답 생성
    const aiResponse = await responseAgent(context);

    // 메시지 저장
    const { error } = await supabaseClient.from("chat_messages").insert({
      chat_room_id: chat_room_id,
      content: aiResponse,
    });

    if (error) throw error;

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
