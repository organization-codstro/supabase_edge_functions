//tools 에서 사용하는 전역적인 타입

export interface AiUserSettings {
  user_ai_setting_id: string;
  //사용자를 부르는 호칠
  user_ai_setting_call_me_name: string;
  //자기 ai 인식
  user_ai_setting_ai_self_awareness: boolean;
  //서바스 접근 여부
  user_ai_setting_service_integration: boolean;
  //감정
  user_ai_setting_emotion: string;
}

export interface AIPersona {
  ai_persona_id: string;
  ai_persona_name: string;
  ai_persona_description: string;
  ai_persona_personality: string;
  ai_persona_gender: string;
  ai_persona_age: number;
  ai_persona_preferred_features: string;
  ai_persona_speech_style: string;
  ai_persona_one_line_introduction?: string;
  ai_persona_profile_image_path?: string;
  ai_persona_preferred_topics: string;
  created_at: string;
}

export interface AIPersonaInfo {
  chat_room_ai_id: string;
  baseInfo: AIPersona;
  userSettings: AiUserSettings;
}

export interface ChatMessage {
  chat_message_id: string;
  //전송한 사람
  chat_message_sender_type: "AI" | "USER";
  //내용
  chat_message_content: string;
  //이모지 id
  emoticon_id?: string;
  //포함되어있는 chat id
  chat_room_id: string;
  //메세지 위치
  chat_message_index: number;
  // 생성시간
  created_at: string;
  //파일 url
  chat_message_file_content_path: string[];
  //멘션시 들어가는 에이전트 id
  mention_target_agent_id?: string;
  //답장
  chat_message_reply_message?: string;
  //답장시에 들어가는 ai 에이전트 id
  chat_message_reply_target_agent_id?: string;
  //메세지 타입
  chat_message_format: string;
  //메세지 의도
  chat_message_interaction_type: "CASUAL" | "ACTION_REQUEST";
}

export interface ChatRoom {
  chat_room_id: string;
  user_id: string;
  chat_room_name: string;
  chat_room_type: "DAILY" | "PROJECT";
  chat_room_topics: string[];
  chat_room_latest_message_index: number;
  chat_room_last_read_message_index: number;
  created_at: string;
  chat_room_daily_is_main?: boolean;
}

export interface Emoticon {
  emoticon_id: string;
  emoticon_name: string;
  emoticon_img_url: string;
  emoticon_tags: string[];
  created_at: string | null;
  updated_at: string | null;
}

export type GROUP_NAME_TYPE =
  | "web"
  | "app"
  | "server"
  | "ai"
  | "work"
  | "other";
export interface UserGroup {
  group_id: string;
  group_name: GROUP_NAME_TYPE;
}

export interface AgentContext {
  userMessage: ChatMessage;
  recentMessages: ChatMessage[];
  personas: AIPersonaInfo[];
  chatRoom: ChatRoom;
  userGroups: UserGroup[];
}
export interface ChatMemory {
  chat_memory_id: number;
  chat_room_id: string;
  chat_memory_contents: string;
  start_message_index: number;
  end_message_index: number;
  created_at: string;
  updated_at: string | null;
}

export interface AiUserRecord {
  ai_user_record_id: string;
  user_id: string;
  ai_user_record_summary: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreateTodoInput {
  todo_name: string;
  todo_content: string;
  todo_description: string;
  todo_start_date: string;
  todo_end_date: string;
  todo_status: string;
  group_id: string;
  project_id?: string;
  project_page_id?: string;
}

export interface Todo extends CreateTodoInput {
  todo_id: string;
  created_at: string;
  updated_at: string | null;
}
