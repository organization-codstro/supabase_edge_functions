// 난이도 레벨 → 텍스트 매핑
export const LEVEL_LABEL: Record<number, string> = {
  1: "컴포넌트 (작은 UI 단위)",
  2: "기능 클론 (로직 중심 단일 기능)",
  3: "페이지 클론 (하나의 완성된 페이지)",
  4: "플로우 클론 (여러 페이지가 이어진 하나의 흐름)",
  5: "프로젝트 클론 (하나의 완성된 프로젝트)",
};

// 난이도 레벨 → DB difficulty 값 매핑
export const LEVEL_TO_DIFFICULTY: Record<
  number,
  "beginner" | "intermediate" | "advanced"
> = {
  1: "beginner",
  2: "beginner",
  3: "intermediate",
  4: "intermediate",
  5: "advanced",
};
