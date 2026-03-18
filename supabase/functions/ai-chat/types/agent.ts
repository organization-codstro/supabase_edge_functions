export type AgentResponse = {
  chat_message_content: string;
  chat_message_format: string;
  chat_message_interaction_type: string;
  emoticon_id: string | null;
  chat_message_file_content_url: string[] | null;
  chat_message_reply_message_id: string | null;
  chat_message_reply_target_agent_id: string | null;
  chat_message_mention_target_agent_id: string | null;
};
