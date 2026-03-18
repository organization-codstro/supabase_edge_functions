// Supabase 프로젝트 URL
// 예: https://<project-ref>.supabase.co
export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

// Supabase Service Role Key (RLS 우회 가능한 어드민 키)
// Supabase 대시보드 → Settings → API → service_role
export const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
  "SUPABASE_SERVICE_ROLE_KEY",
)!;

// process-chat-memory-job Edge Function URL
// 예: https://<project-ref>.supabase.co/functions/v1/process-chat-memory-job
export const PROCESS_JOB_URL = Deno.env.get("PROCESS_JOB_URL")!;

// create-chat-memory-job Edge Function URL
// 예: https://<project-ref>.supabase.co/functions/v1/create-chat-memory-job
export const CREATE_MEMORY_JOB_URL = Deno.env.get("CREATE_MEMORY_JOB_URL")!;

// OpenAI API Key
// platform.openai.com → API Keys
export const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

// 사용할 OpenAI 모델명
export const OPENAI_MODEL = "gpt-4.1";
