import { GenerateStudyPlanRequest } from "../types/types.ts";

export function buildStudyPlanPrompt(req: GenerateStudyPlanRequest): string {
  const techStackSection =
    req.techStacks.length > 0
      ? `- 기술 스택: ${req.techStacks.join(", ")}`
      : "- 기술 스택: 없음 (학습 목표에 맞게 추천)";

  const currentLevelSection = req.currentLevel
    ? `- 현재 수준 (알고 있는 것): ${req.currentLevel}`
    : "";

  const maxHoursSection = req.maxHours
    ? `- 최대 학습 시간: ${req.maxHours}시간`
    : "";

  return `
당신은 개인 맞춤형 학습 계획을 설계하는 전문 교육 컨설턴트입니다.
아래 입력 정보를 기반으로 학습 계획 데이터를 JSON 형식으로 생성해주세요.

## 입력 정보
- 계획 이름: ${req.name}
- 주제/설명: ${req.description}
- 학습 목표: ${req.goal}
${currentLevelSection}
${maxHoursSection}
- 학습 스타일: ${req.learningStyle}
- 최종 산출물: ${req.expectedOutput}
- 시작일: ${req.startDate}
- 종료일: ${req.endDate}
${techStackSection}

## 출력 규칙
순수 JSON만 반환하세요. 마크다운 코드 블록 없이 반환하세요.

{
  "study_plan_description": "입력 정보를 바탕으로 보완된 학습 계획 설명 (2~3문장)",
  "nodes": [
    {
      "study_plan_node_name": "노드 제목",
      "study_plan_node_description": "이 노드에서 학습할 내용 설명 (1~2문장)",
      "study_plan_node_start_date": "YYYY-MM-DD",
      "study_plan_node_end_date": "YYYY-MM-DD",
      "study_plan_node_position": 1,
      "tech_stack_name": "연관 기술 이름 (기술 스택 목록 중 하나, 없으면 가장 관련 있는 것)"
    }
  ]
}

## 노드 설계 가이드라인
- 노드 수: 시작일~종료일 기간과 기술 스택 수를 고려해 적절하게 (최소 3개, 최대 15개)
- 각 노드는 학습 스타일 "${req.learningStyle}"에 맞게 설계
- 노드 날짜는 시작일(${req.startDate})~종료일(${req.endDate}) 범위 안에서 순서대로 배분
- study_plan_node_position은 1부터 순서대로 증가
- tech_stack_name은 반드시 아래 목록 중 하나여야 함: [${req.techStacks.join(", ")}]
  - 기술 스택이 없는 경우 학습 목표에 가장 적합한 기술명을 자유롭게 작성
- 최종 산출물 "${req.expectedOutput}"을 달성할 수 있는 흐름으로 구성
`.trim();
}
