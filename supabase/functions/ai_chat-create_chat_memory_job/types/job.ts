export interface ChatMemoryJob {
  chat_memory_job_id: string;
  chat_room_id: string;
  chat_memory_job_start_index: number;
  chat_memory_job_end_index: number;
  chat_memory_job_status: "pending" | "processing" | "done" | "failed";
  chat_memory_job_retry_count: number;
  created_at: string;
}

export interface CreateJobParams {
  chat_room_id: string;
  start_index: number;
  end_index: number;
}
