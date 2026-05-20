import type { ChatCompletionTool } from "openai/resources/chat/completions";

interface CrawlResult {
  url: string;
  content: string;
  title?: string;
}

export const crawlUrlTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "crawlUrl",
    description: `URL의 웹 페이지 내용을 가져옵니다.
- 사용자가 URL을 공유하며 내용 확인이나 분석을 요청할 때 호출하세요.
- 최신 정보나 외부 자료가 필요할 때 활용하세요.
- 불필요한 호출은 피하고, URL이 명확히 주어지거나 직접적으로 웹패이지 서칭 요청이 있으면 사용하여 주세요`,
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "크롤링할 웹 페이지 URL",
        },
      },
      required: ["url"],
    },
  },
};

export async function crawlUrl(url: string): Promise<CrawlResult> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ChatBot/1.0)",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch URL: ${response.status} ${response.statusText}`,
    );
  }

  const html = await response.text();

  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();

  // 스크립트, 스타일, 태그 제거 후 텍스트 추출
  const content = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000); // 토큰 절약을 위해 5000자 제한

  return { url, title, content };
}
