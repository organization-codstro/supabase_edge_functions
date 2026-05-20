// ============================
// 요청 타입 (프론트 → Edge Function)
// ============================
export interface GenerateCloneCodingRequest {
  userId: string; // 요청한 유저 ID
  name: string; // 클론코딩 이름
  topic: string; // 주제
  features: string; // 클론하고 싶은 기능 설명
  level: 1 | 2 | 3 | 4 | 5; // 난이도 레벨
  gitUrl?: string; // 레벨 5일 때만 (프로젝트 클론)
  frameworks?: string[]; // 사용할 프레임워크 목록
  libraries?: string[]; // 사용할 라이브러리 목록
}

// ============================
// GPT가 반환하는 JSON 구조
// ============================
export interface CloneCodingStep {
  step: number;
  title: string;
  description: string;
  tasks: string[];
}

export interface GPTGeneratedData {
  clone_coding_title: string;
  clone_coding_description: string;
  clone_coding_tech_stack: string[];
  clone_coding_tags: string[];
  clone_coding_difficulty: "beginner" | "intermediate" | "advanced";
  clone_coding_estimated_hours: string;
  clone_coding_steps: CloneCodingStep[];
  clone_coding_project_structure: string;
}

// ============================
// DB Insert 타입 (clone_codings 테이블)
// ============================
export interface CloneCodingInsert {
  clone_coding_title: string;
  clone_coding_description: string;
  clone_coding_tech_stack: string[];
  clone_coding_tags: string[];
  clone_coding_difficulty: string;
  clone_coding_estimated_hours: string;
  clone_coding_github_url?: string | null;
  clone_coding_steps: CloneCodingStep[];
  clone_coding_project_structure?: string | null;
  clone_coding_thumbnail_url?: string | null;
  clone_coding_demo_url?: string | null;
}

// ============================
// DB Insert 타입 (user_clone_codings 테이블)
// ============================
export interface UserCloneCodingInsert {
  user_id: string;
  clone_coding_id: string;
  user_clone_coding_status: string;
  user_clone_coding_is_bookmarked: boolean;
}

// ============================
// 응답 타입 (Edge Function → 프론트)
// ============================
export interface GenerateCloneCodingResponse {
  success: boolean;
  data?: {
    cloneCoding: CloneCodingInsert & { clone_coding_id: string };
    userCloneCoding: UserCloneCodingInsert & { user_clone_coding_id: string };
  };
  error?: string;
}
