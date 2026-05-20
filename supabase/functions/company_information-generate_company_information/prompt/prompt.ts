/**
 * AI 프롬프트 템플릿
 */

export const generateStudyPlanPrompt = (
  companyName: string,
  jobField: string,
  recruitmentType: string,
  officialLink?: string,
): string => {
  const linkInfo = officialLink
    ? `공식 공고 링크: ${officialLink}\n링크와 회사 정보를 분석해주세요.`
    : `공식 공고 링크가 제공되지 않았습니다. ${companyName}의 정보를 인터넷에서 찾아서 분석해주세요.`;

  return `당신은 회사 정보 분석 전문가입니다.

다음 정보를 기반으로 회사 정보를 분석해주세요:
- 회사명: ${companyName}
- 직무: ${jobField}
- 채용 유형: ${recruitmentType}
${linkInfo}

다음 형식으로 응답해주세요 (JSON 형식):
{
  "companyDescription": "회사에 대한 간단한 설명 + 대표 상품이나 제품",
  "companyValues": "회사의 핵심 가치관 (3-4줄)",
  "companyWebsite": "회사 공식 웹사이트 URL (있는 경우만)"
}

회신은 반드시 유효한 JSON 형식이어야 합니다.`;
};

export const extractJobPostingPrompt = (
  companyName: string,
  jobField: string,
): string => {
  return `당신은 채용 정보 검색 전문가입니다.

회사명: ${companyName}
직무: ${jobField}

이 회사의 해당 직무에 대한 공식 채용 공고 링크를 찾아주세요.
한국 채용 사이트 (잡코리아, 사람인, 로켓펀치, 구글 채용 페이지 등)를 포함해서 검색해주세요.

응답 형식:
{
  "found": true/false,
  "url": "찾은 링크 (있는 경우)",
  "source": "링크 출처 (있는 경우)"
}

반드시 유효한 JSON 형식으로 응답해주세요.`;
};
