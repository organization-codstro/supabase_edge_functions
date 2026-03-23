import OpenAI from "https://deno.land/x/openai@v4.69.0/mod.ts";

interface ProjectInfo {
  project_id: string;
  project_name: string | null;
  project_topic: string | null;
  project_description: string | null;
  project_stacks: string | null;
}

export async function generateFirstQuestion(
  project: ProjectInfo,
): Promise<string> {
  const client = new OpenAI({
    apiKey: Deno.env.get("OPENAI_API_KEY")!,
  });

  const systemPrompt = `
당신은 주니어 개발자의 프로젝트 기획을 도와주는 친절한 멘토입니다.
사용자가 입력한 프로젝트 정보를 바탕으로, 프로젝트 기획을 구체화하기 위한 첫 번째 질문을 생성합니다.

[규칙]
- 질문은 한국어로 작성합니다.
- 질문은 하나만 생성합니다.
- 프로젝트의 핵심 목적이나 타겟 사용자, 주요 기능 중 가장 불명확한 부분을 파고드는 질문을 합니다.
- 친근하고 격려하는 톤을 유지합니다.
- 질문만 출력하고, 부가 설명이나 인사말은 붙이지 않습니다.
`.trim();

  const userPrompt = `
다음은 사용자가 기획 중인 프로젝트 정보입니다.

- 프로젝트 이름: ${project.project_name ?? "미정"}
- 프로젝트 주제: ${project.project_topic ?? "없음"}
- 하고 싶은 기능: ${project.project_description ?? "없음"}
- 다루고 싶은 기술/개념: ${project.project_stacks ?? "없음"}

이 정보를 바탕으로 프로젝트 기획을 더 구체화할 수 있는 첫 번째 질문을 생성해주세요.
`.trim();

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 300,
  });

  const question = response.choices[0]?.message?.content?.trim();

  if (!question) {
    throw new Error("Failed to generate first question from OpenAI");
  }

  return question;
}
