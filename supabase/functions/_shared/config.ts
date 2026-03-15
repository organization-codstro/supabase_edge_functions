// _shared/config.ts

export const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// 예시: Edge Function용 기본 옵션
export const OPENAI_MODEL = "gpt-4.1-mini";
