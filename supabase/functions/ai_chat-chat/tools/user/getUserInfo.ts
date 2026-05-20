/**
 * 유저 AI 기록을 조회하는 도구입니다.
 *
 * - `ai_user_records` 테이블에서 해당 유저의 AI 기록 요약 목록을 가져옵니다.
 * - AI가 사용자별 장기 기억 또는 개인 기록을 참조해야 할 때 사용합니다.
 * - 현재는 user_id를 기준으로 전체 레코드를 반환하며, 조회 결과가 없으면 빈 배열을 반환합니다.
 */
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { supabaseClient } from "../../../_shared/supabaseClient.ts";
import type { AiUserRecord } from "../../types/tools.ts";

export const getUserInfoTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "getUserInfo",
    description: `유저의 AI 기록(개인화 메모리)을 조회합니다.
- userId를 기준으로 ai_user_records 테이블에서 레코드를 가져옵니다.
- 각 레코드는 ai_user_record_summary를 포함합니다.
- AI가 사용자 개인 기록을 참고하거나 요약을 확인해야 할 때 호출하세요.`,
    parameters: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "조회할 유저의 UUID입니다.",
        },
      },
      required: ["userId"],
    },
  },
};

export async function getUserInfo(userId: string): Promise<AiUserRecord[]> {
  const { data, error } = await supabaseClient
    .from("ai_user_records")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as AiUserRecord[];
}
