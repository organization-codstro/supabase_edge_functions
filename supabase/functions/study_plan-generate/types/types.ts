// ============================
// 요청 타입 (프론트 → Edge Function)
// ============================
export interface GenerateStudyPlanRequest {
  userId: string;
  name: string; // 계획 이름 (필수)
  description: string; // 계획 설명/주제 (필수)
  goal: string; // 학습 목표 (필수)
  currentLevel?: string; // 현재 수준 (선택)
  maxHours?: number; // 최대 학습 시간 (선택)
  learningStyle: string; // 학습 스타일 (필수)
  expectedOutput: string; // 최종 산출물 (필수)
  startDate: string; // 시작일 YYYY-MM-DD (필수)
  endDate: string; // 종료일 YYYY-MM-DD (필수)
  techStacks: string[]; // 기술 스택 태그 목록
}

// ============================
// GPT가 반환하는 노드 구조
// ============================
export interface GPTStudyPlanNode {
  study_plan_node_name: string;
  study_plan_node_description: string;
  study_plan_node_start_date: string; // YYYY-MM-DD
  study_plan_node_end_date: string; // YYYY-MM-DD
  study_plan_node_position: number;
  tech_stack_name: string; // tech_stacks 조회용 이름
}

// ============================
// GPT가 반환하는 전체 구조
// ============================
export interface GPTGeneratedStudyPlan {
  study_plan_description: string; // 보완된 계획 설명
  nodes: GPTStudyPlanNode[];
}

// ============================
// DB Insert 타입 - study_plans
// ============================
export interface StudyPlanInsert {
  user_id: string;
  study_plan_name: string;
  study_plan_description: string;
  study_plan_start_date: string;
  study_plan_end_date: string;
  study_plan_state: string;
  study_plan_is_recommendation: boolean;
  study_plan_image_url?: string | null;
}

// ============================
// DB Insert 타입 - study_plan_nodes
// ============================
export interface StudyPlanNodeInsert {
  study_plan_id: string;
  tech_stack_id: string;
  study_plan_node_name: string;
  study_plan_node_description: string;
  study_plan_node_start_date: string;
  study_plan_node_end_date: string;
  study_plan_node_position: number;
  study_plan_node_completed: boolean;
}

// ============================
// 응답 타입 (Edge Function → 프론트)
// ============================
export interface GenerateStudyPlanResponse {
  success: boolean;
  data?: {
    studyPlan: StudyPlanInsert & { study_plan_id: string };
    nodes: StudyPlanNodeInsert[];
    skippedNodes: string[]; // tech_stack 못 찾은 노드 이름 목록
  };
  error?: string;
}
