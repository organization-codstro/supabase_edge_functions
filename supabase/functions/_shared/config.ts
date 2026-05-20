// Supabase 프로젝트 URL
// 예: https://<project-ref>.supabase.co
export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

// Supabase Service Role Key (RLS 우회 가능한 어드민 키)
// Supabase 대시보드 → Settings → API → service_role
export const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
  "SUPABASE_SERVICE_ROLE_KEY",
)!;

// ai_chat-process_chat_memory_job Edge Function URL
// 예: https://<project-ref>.supabase.co/functions/v1/ai_chat-process_chat_memory_job
export const PROCESS_JOB_URL = Deno.env.get("PROCESS_JOB_URL")!;

// ai_chat-create_chat_memory_job Edge Function URL
// 예: https://<project-ref>.supabase.co/functions/v1/ai_chat-create_chat_memory_job
export const CREATE_MEMORY_JOB_URL = Deno.env.get("CREATE_MEMORY_JOB_URL")!;

// OpenAI API Key
// platform.openai.com → API Keys
export const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

// 사용할 OpenAI 모델명
export const OPENAI_MODEL = "gpt-4.1";

export const FIREBASE_PROJECT_ID = Deno.env.get("FIREBASE_PROJECT_ID")!;
export const FIREBASE_CLIENT_EMAIL = Deno.env.get("FIREBASE_CLIENT_EMAIL")!;
export const FIREBASE_PRIVATE_KEY = Deno.env.get("FIREBASE_PRIVATE_KEY")!;
export const FIREBASE_STORAGE_BUCKET = Deno.env.get("FIREBASE_STORAGE_BUCKET")!;
