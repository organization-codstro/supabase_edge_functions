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
          description:
            "내용만 있다면 TEXT을, 이모지를 사용 했다면 MULTIMODAL을 사용",
        },
        chat_message_format: {
          type: "string",
          description: "메시지 형식 (예: text, markdown, html 등)",
        },
        chat_message_interaction_type: {
          type: "string",
          description:
            "주제가 일상이면 CASUAL을 todo추가와 같이 서비스 관련 기능을 하거나 특수한 주제에 대하여 말을하면 ACTION_REQUEST을 사용",
        },
        emoticon_id: {
          type: "string",
          description: "사용할 이모지 ID (UUID 형식, 없으면 null)",
          nullable: true,
        },
        chat_message_file_content_url: {
          type: "array",
          description: "메시지에 포함할 파일 URL 목록",
          items: {
            type: "string",
            description: "파일 URL",
          },
          nullable: true,
        },
        chat_message_reply_message_id: {
          type: "string",
          description: "답장 대상 메시지 ID (UUID 형식, 없으면 null)",
          nullable: true,
        },
        chat_message_reply_target_agent_id: {
          type: "string",
          description: "답장 대상 에이전트 ID (UUID 형식, 없으면 null)",
          nullable: true,
        },
        chat_message_mention_target_agent_id: {
          type: "string",
          description: "멘션 대상 에이전트 ID (UUID 형식, 없으면 null)",
          nullable: true,
        },
      },
      required: [
        "chat_message_content",
        "chat_message_format",
        "chat_message_interaction_type",
      ],
    },
  },
};
