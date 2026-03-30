/**
 * 메모리 요약 결과의 JSON Schema
 * strict: true → 정의된 필드만 허용, 누락 불가
 */
export const memoryResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "memory_contents",
    strict: true,
    schema: {
      type: "object",
      properties: {
        facts: {
          type: "array",
          items: { type: "string" },
          description: "사용자에 대한 객관적 사실 (이름, 나이, 직업 등)",
        },
        preferences: {
          type: "array",
          items: { type: "string" },
          description: "사용자의 취향 및 선호도",
        },
        goals: {
          type: "array",
          items: { type: "string" },
          description: "사용자의 목표 또는 원하는 것",
        },
        current_tasks: {
          type: "array",
          items: { type: "string" },
          description: "현재 진행 중이거나 요청한 작업",
        },
        emotional_state: {
          type: "array",
          items: { type: "string" },
          description: "대화에서 드러난 감정 상태",
        },
        conversation_summary: {
          type: "string",
          description: "대화 전체의 핵심 내용 요약 (2~3문장)",
        },
      },
      required: [
        "facts",
        "preferences",
        "goals",
        "current_tasks",
        "emotional_state",
        "conversation_summary",
      ],
      additionalProperties: false,
    },
  },
} as const;
