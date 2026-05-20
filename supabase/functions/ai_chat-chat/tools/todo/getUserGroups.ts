/**
 * 유저의 그룹 목록을 조회합니다.
 *
 * - `ai_chat-chat/context.ts`에서 `buildContext` 실행 시 호출됩니다.
 * - AI가 `createTodo` 도구를 사용할 때,
 *   사용자의 그룹 목록을 참고하여 적절한 `group_id`를 결정할 수 있도록 합니다.
 * - 결과가 없으면 빈 배열을 반환합니다.
 */
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { supabaseClient } from "../../../_shared/supabaseClient.ts";
import type { UserGroup } from "../../types/tools.ts";

export const getUserGroupsTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "getUserGroups",
    description: "유저의 그룹 목록을 조회합니다.",
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

export async function getUserGroups(userId: string): Promise<UserGroup[]> {
  const { data, error } = await supabaseClient
    .from("groups")
    .select("group_id, group_name")
    .eq("user_id", userId);

  if (error) throw error;
  return (data ?? []) as UserGroup[];
}
