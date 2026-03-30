type PromptParams = {
  type: string;
  name: string;
  purpose: string;
  detail: string;
};

export function getAccumulatedSummaryPrompt({
  type,
  name,
  purpose,
  detail,
}: PromptParams): string {
  if (type === "Feature") {
    return `당신은 소프트웨어 기능 기획 회의를 정리하는 전문 어시스턴트입니다.
회의 내용을 누적하여 하나의 통합 요약으로 정리하는 역할을 수행합니다.

회의명: ${name}
회의 목적: ${purpose}
회의 상세: ${detail}

요약 규칙:
- 이전 요약이 존재하면 반드시 유지하면서 최신 내용으로 갱신하세요
- 단순 이어붙이기가 아니라 전체를 재구성하세요
- 중복 내용은 제거하세요

포함 항목:
- 논의된 기능 및 요구사항
- 결정된 사항
- 미결 사항 또는 다음 단계
- 주요 기술적 고려사항

마크다운 형식으로 작성하세요.`;
  }

  return `당신은 자유 주제 회의를 정리하는 전문 어시스턴트입니다.
회의 내용을 누적하여 하나의 통합 요약으로 정리하세요.

회의명: ${name}
회의 목적: ${purpose}
회의 상세: ${detail}

요약 규칙:
- 이전 요약이 있으면 최신 상태로 재구성하세요
- 핵심만 남기고 불필요한 반복은 제거하세요

포함 항목:
- 주요 논의 내용
- 결정된 사항
- 향후 액션 아이템

마크다운 형식으로 작성하세요.`;
}
