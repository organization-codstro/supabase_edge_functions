//todo생성을 위해 유저의 그룹 가져오는 함수

import { supabaseClient } from "../../../_shared/supabaseClient.ts";

export async function getUserGroups(userId: string) {
  const { data, error } = await supabaseClient
    .from("groups")
    .select("group_id, group_name, group_type")
    .eq("user_id", userId);

  if (error) throw error;
  return data ?? [];
}
