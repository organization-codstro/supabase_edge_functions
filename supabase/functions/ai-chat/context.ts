import type {
  AgentContext,
  AIPersonaInfo,
  ChatMessage,
  ChatRoom,
} from "./types/tools.ts";
import { getUserGroups } from "./tools/todo/getUserGroups.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";

export default async function buildContext(
  chat_room_id: string,
  userMessage: ChatMessage,
): Promise<AgentContext> {
  // 1. 최근 메시지 20개
  const { data: recentMessages, error: msgError } = await supabaseClient
    .from("chat_messages")
    .select("*")
    .eq("chat_room_id", chat_room_id)
    .order("chat_message_index", { ascending: false })
    .limit(20);

  if (msgError) throw new Error(`메시지 조회 실패: ${msgError.message}`);

  // 2. 채팅방 정보
  const { data: chatRoom, error: roomError } = await supabaseClient
    .from("chat_rooms")
    .select("*")
    .eq("chat_room_id", chat_room_id)
    .single();

  if (roomError) throw new Error(`채팅방 조회 실패: ${roomError.message}`);

  // 3. chat_room_ai_settings → user_ai_settings → ai_personas 조인
  const { data: aiSettings, error: aiError } = await supabaseClient
    .from("chat_room_ai_settings")
    .select(
      `
      chat_room_ai_id,
      user_ai_settings (
        user_ai_setting_id,
        user_ai_setting_call_me_name,
        user_ai_setting_ai_self_awareness,
        user_ai_setting_service_integration,
        user_ai_setting_emotion,
        ai_personas (
          ai_persona_id,
          ai_persona_name,
          ai_persona_category,
          ai_persona_gender,
          ai_persona_personality,
          ai_persona_speech_style,
          ai_persona_age,
          ai_persona_preferred_topics,
          ai_persona_preferred_features,
          ai_persona_one_line_introduction,
          ai_persona_profile_image_path,
          created_at
        )
      )
    `,
    )
    .eq("chat_room_id", chat_room_id);

  if (aiError) throw new Error(`페르소나 조회 실패: ${aiError.message}`);

  // 4. personas 구조로 변환
  const personas: AIPersonaInfo[] = (aiSettings ?? [])
    .map((setting: any) => {
      const userSettings = setting.user_ai_settings;
      const baseInfo = userSettings?.ai_personas;
      if (!userSettings || !baseInfo) return null;

      return {
        chat_room_ai_id: setting.chat_room_ai_id,
        baseInfo,
        userSettings: {
          user_ai_setting_id: userSettings.user_ai_setting_id,
          user_ai_setting_call_me_name:
            userSettings.user_ai_setting_call_me_name,
          user_ai_setting_ai_self_awareness:
            userSettings.user_ai_setting_ai_self_awareness,
          user_ai_setting_service_integration:
            userSettings.user_ai_setting_service_integration,
          user_ai_setting_emotion: userSettings.user_ai_setting_emotion,
        },
      } satisfies AIPersonaInfo;
    })
    .filter(Boolean) as AIPersonaInfo[];

  // 5. userGroups 가져오기
  const userGroups = await getUserGroups(chatRoom.user_id);

  return {
    userMessage,
    recentMessages: (recentMessages ?? []) as ChatMessage[],
    personas,
    chatRoom: chatRoom as ChatRoom,
    userGroups, // AgentContext 타입에 추가 필요
  };
}
