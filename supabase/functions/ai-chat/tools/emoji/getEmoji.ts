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
- 감정이나 반응을 더 생생하게 표현하고 싶을 때 적극적으로 활용하세요.
- 대화 흐름상 어울리는 감정이 있다면 망설이지 말고 호출하세요.
- 사용자가 이모티콘을 보냈고 (ChatMessage.emoticon_id 존재) 의미가 궁금할 때, emoticonId로 조회하세요.

【이모티콘 사용 방법】
- 검색 후 반환된 emoticon_id를 메세지의 emoticon_id 필드에 넣어 전송하세요.
- 이모티콘은 텍스트와 함께 사용하거나 단독으로 사용할 수 있습니다.

【검색 방식】
- tag로 검색: emoticon_tags 기준으로 감정에 맞는 이모티콘을 가져옵니다.
- tag 없이 검색: 전체 이모티콘 중에서 가져옵니다.
- emoticonId로 조회: 특정 이모티콘 1개의 정보를 가져옵니다. (유저가 보낸 이모티콘 확인용)

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
            "특정 이모티콘 ID. 사용자가 보낸 이모티콘(ChatMessage.emoticon_id) 확인 시 사용. 이 값이 있으면 tag는 무시됩니다.",
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
  // 특정 이모티콘 ID 조회 (유저가 보낸 이모티콘 확인)
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
