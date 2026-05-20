import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { supabaseClient } from "../../../_shared/supabaseClient.ts";
import { Emoticon } from "../../types/tools.ts";
import { EmoticonTagEnum } from "../../constant/constant.ts";

export type EmoticonTag = EmoticonTagEnum[number];

export const getEmojiTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "getEmoji",
    description: `이모티콘을 검색하거나 특정 이모티콘 정보를 가져옵니다.

【사용 시점】
- 대화 중 감정·반응을 더 생생하게 전달하고 싶을 때 적극적으로 활용하세요.
- 유저가 이모티콘을 보냈을 때(ChatMessage.emoticon_id 존재) 반드시 emoticonId로 조회한 후 반응하세요.

【유저가 이모티콘을 보냈을 때 행동 지침】
유저가 이모티콘을 보내면 아래 흐름으로 반응하세요:
1. emoticonId로 해당 이모티콘을 조회합니다.
2. 이모티콘을 보고 공감하거나, 이전 대화를 보고 이모티콘으로 반응허거나 대화를 이어나가세요
3. 이모티콘이 대화에 자연스럽게 녹아들도록 노력하세요. 텍스트와 함께 사용하거나, 상황에 따라 단독으로 사용해도 좋습니다.
4. 가능하면 대화의 흐름을 확인하고 문제가 없다면 이모티콘을 활용해 감정을 표현하는 것을 권장드립니다.

【이모티콘으로 감정 표현할 때 행동 지침】
- 대화 흐름상 감정이 느껴지면 망설이지 말고 tag로 검색해서 이모티콘을 꺼내세요.
- 이모티콘은 텍스트와 함께, 또는 단독으로 사용할 수 있습니다.
- 검색 후 반환된 emoticon_id를 메시지의 emoticon_id 필드에 넣어 전송하세요.

【검색 방식】
- tag로 검색: emoticon_tags 기준으로 감정에 맞는 이모티콘을 가져옵니다.
- tag 없이 검색: 전체 이모티콘 중에서 랜덤하게 가져옵니다.
- emoticonId로 조회: 유저가 보낸 이모티콘 1개의 정보를 확인합니다.

【사용 가능한 태그】
${Object.values(EmoticonTagEnum)
  .map((tag) => `"${tag}"`)
  .join(", ")}`,
    parameters: {
      type: "object",
      properties: {
        emoticonId: {
          type: "string",
          description:
            "특정 이모티콘 ID. 유저가 보낸 이모티콘(ChatMessage.emoticon_id) 확인 시 사용. 이 값이 있으면 tag는 무시됩니다.",
        },
        tag: {
          type: "string",
          description: `감정 태그로 이모티콘 검색. 사용 가능한 태그: ${Object.values(EmoticonTagEnum).join(", ")}`,
        },
      },
    },
  },
};

export async function getEmoji(
  emoticonId?: string,
  tag?: string,
): Promise<Emoticon | Emoticon[] | null> {
  // 특정 이모티콘 ID 조회 (유저가 보낸 이모티콘 확인혹은 리스트 확인)
  if (emoticonId) {
    const { data, error } = await supabaseClient
      .from("emoticons")
      .select("*")
      .eq("emoticon_id", emoticonId)
      .single();

    if (error) return null;
    return data;
  }

  // 태그로 검색
  if (tag && Object.values(EmoticonTagEnum).includes(tag as EmoticonTagEnum)) {
    const { data } = await supabaseClient
      .from("emoticons")
      .select("*")
      .contains("emoticon_tags", [tag])
      .limit(10);

    if (data && data.length > 0) return data;
  }

  // 태그 없거나 태그 검색 결과 없으면 전체에서 조회
  const { data } = await supabaseClient.from("emoticons").select("*").limit(10);

  return data ?? [];
}
