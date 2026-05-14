export function buildCompanyMatchPrompt(
  userSummary: string,
  companyName: string,
  companyIndustry: string | null,
  companyDescription: string | null,
  companyValues: string | null,
): string {
  return `
당신은 취업 매칭 전문가입니다. 아래 유저 정보와 회사 정보를 바탕으로 매칭 분석을 해주세요.

평가 기준:
- 기술 스택 적합도 (40점)
- 프로젝트 경험 연관성 (25점)
- 회사 가치관 적합성 (20점)
- 산업 분야 이해도 (15점)

점수 규칙:
- 매우 부적합: 30~49
- 보통: 50~69
- 적합: 70~84
- 매우 적합: 85~100

같은 점수를 반복하지 말고 입력 내용 차이에 따라 반드시 다른 점수를 산출하세요.

[유저 정보]
${userSummary}

[회사 정보]
- 회사명: ${companyName}
- 업종: ${companyIndustry ?? "정보 없음"}
- 회사 소개: ${companyDescription ?? "정보 없음"}
- 핵심 가치: ${companyValues ?? "정보 없음"}

반드시 아래 형식만 응답:

SCORE: 숫자

SUMMARY: 한 줄 요약

REASON:
(유저와 이 회사가 얼마나 잘 맞는지, 구체적 근거 3~4가지를 bullet point로)

SUGGESTIONS:
(매칭률을 높이기 위한 구체적 개선 제안 2~3가지를 bullet point로)
  `.trim();
}
