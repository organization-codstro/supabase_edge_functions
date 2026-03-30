type ResponseFormatJSONSchema = {
  type: "json_schema";
  json_schema: {
    name: string;
    schema: Record<string, unknown>;
  };
};

export const response_format: ResponseFormatJSONSchema = {
  type: "json_schema",
  json_schema: {
    name: "agent_response",
    schema: {
      type: "object",
      properties: {
        chat_message_content: {
          type: "string",
          description: "응답 텍스트 내용. 이모티콘만 보낼 경우 빈 문자열 가능.",
        },
        chat_message_format: {
          type: "string",
          enum: ["TEXT", "IMG", "MULTIMODAL"],
          description:
            "TEXT: 텍스트만 있을 때, IMG: 이미지만 있을 때, MULTIMODAL: 텍스트+이모티콘 또는 텍스트+이미지",
        },
        chat_message_interaction_type: {
          type: "string",
          enum: ["CASUAL", "ACTION_REQUEST"],
          description:
            "CASUAL: 일상 대화, ACTION_REQUEST: todo 추가 등 서비스 기능 수행 또는 특수 주제",
        },
        emoticon_id: {
          type: "string",
          description: "사용할 이모티콘 ID (UUID 형식, 없으면 빈 문자열)",
        },
        chat_message_file_content_path: {
          type: "array",
          description: "첨부 파일 경로 목록. 없으면 빈 배열.",
          items: {
            type: "string",
          },
        },
        chat_message_reply_message_id: {
          type: "string",
          description: "답장 대상 메시지 ID (UUID 형식, 없으면 빈 문자열)",
        },
        chat_message_reply_target_agent_id: {
          type: "string",
          description: "답장 대상 에이전트 ID (UUID 형식, 없으면 빈 문자열)",
        },
        chat_message_mention_target_agent_id: {
          type: "string",
          description: "멘션 대상 에이전트 ID (UUID 형식, 없으면 빈 문자열)",
        },
      },
      required: [
        "chat_message_content",
        "chat_message_format",
        "chat_message_interaction_type",
        "emoticon_id",
        "chat_message_file_content_path",
        "chat_message_reply_message_id",
        "chat_message_reply_target_agent_id",
        "chat_message_mention_target_agent_id",
      ],
      additionalProperties: false,
    },
  },
};
