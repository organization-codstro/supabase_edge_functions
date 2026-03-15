// _shared/supabaseClient.ts
import { createClient } from "npm:@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.ts";

export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
