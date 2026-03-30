export interface ChatMemoryJob {
  chat_memory_job_id: string;
  chat_room_id: string;
  chat_memory_job_start_index: number;
  chat_memory_job_end_index: number;
  chat_memory_job_status: "pending" | "processing" | "done" | "failed";
  chat_memory_job_retry_count: number;
  created_at: string;
}

export interface ChatMessage {
  chat_message_index: number;
  chat_message_sender_type: string;
  chat_message_content: string | null;
}

export interface MemoryContents {
  facts: string[];
  preferences: string[];
  goals: string[];
  current_tasks: string[];
  emotional_state: string[];
  conversation_summary: string;
}
