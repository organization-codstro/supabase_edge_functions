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
        chat_message_metadata: {
          type: "object",
          description:
            "메시지 확장 메타데이터. 링크/위치/파일/오디오 등 첨부형 응답이 없으면 attachments는 빈 배열.",
          properties: {
            version: {
              type: "number",
              description: "metadata schema version. 현재는 1.",
            },
            attachments: {
              type: "array",
              description:
                "확장 첨부 목록. type은 link, location, image, audio, file 중 하나를 사용.",
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: [
                      "image",
                      "camera_image",
                      "audio",
                      "file",
                      "link",
                      "location",
                    ],
                  },
                  storagePath: { type: "string" },
                  thumbnailStoragePath: { type: "string" },
                  originalFileName: { type: "string" },
                  mimeType: { type: "string" },
                  fileSizeBytes: { type: "number" },
                  width: { type: "number" },
                  height: { type: "number" },
                  durationMs: { type: "number" },
                  transcript: { type: "string" },
                  url: { type: "string" },
                  title: { type: "string" },
                  description: { type: "string" },
                  siteName: { type: "string" },
                  imageUrl: { type: "string" },
                  imageStoragePath: { type: "string" },
                  provider: { type: "string" },
                  placeName: { type: "string" },
                  addressName: { type: "string" },
                  roadAddressName: { type: "string" },
                  latitude: { type: "number" },
                  longitude: { type: "number" },
                  kakaoPlaceId: { type: "string" },
                  kakaoMapUrl: { type: "string" },
                },
                required: ["type"],
                additionalProperties: false,
              },
            },
            client: {
              type: "object",
              properties: {
                platform: { type: "string" },
                appVersion: { type: "string" },
              },
              required: ["platform"],
              additionalProperties: false,
            },
          },
          required: ["version", "attachments"],
          additionalProperties: false,
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
        "chat_message_metadata",
        "chat_message_reply_message_id",
        "chat_message_reply_target_agent_id",
        "chat_message_mention_target_agent_id",
      ],
      additionalProperties: false,
    },
  },
};
