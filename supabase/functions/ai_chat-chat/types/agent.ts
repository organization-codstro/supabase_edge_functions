export type AgentMessageMetadata = {
  version: number;
  attachments: Array<Record<string, unknown>>;
  client?: {
    platform: string;
    appVersion?: string | null;
  };
};

export type AgentResponse = {
  chat_message_content: string;
  chat_message_format: string;
  chat_message_interaction_type: string;
  emoticon_id: string; // 빈 문자열 or UUID
  chat_message_file_content_path: string[]; // 빈 배열 or 경로 목록
  chat_message_metadata: AgentMessageMetadata;
  chat_message_reply_message_id: string; // 빈 문자열 or UUID
  chat_message_reply_target_agent_id: string; // 빈 문자열 or UUID
  chat_message_mention_target_agent_id: string; // 빈 문자열 or UUID
};
