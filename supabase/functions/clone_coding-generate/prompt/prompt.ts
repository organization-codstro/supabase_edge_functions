import { LEVEL_LABEL } from "../constant/constant.ts";
import { GenerateCloneCodingRequest } from "../types/types.ts";

export function buildPrompt(req: GenerateCloneCodingRequest): string {
  const frameworks = req.frameworks ?? [];
  const libraries = req.libraries ?? [];

  const hasTechStack = frameworks.length > 0 || libraries.length > 0;

  const techStack = hasTechStack
    ? [...frameworks, ...libraries].join(", ")
    : "사용자가 지정하지 않았으므로 프로젝트 주제와 난이도에 가장 적합한 기술 스택을 추천해서 넣어주새요";

  const levelLabel = LEVEL_LABEL[req.level];
  const gitSection = req.gitUrl ? `- 참고 깃헙 URL: ${req.gitUrl}` : "";

  return `
당신은 클론코딩 프로젝트를 설계하는 전문 개발 교육 큐레이터입니다.
아래 입력 정보를 기반으로 클론코딩 프로젝트 데이터를 생성해주세요.

## 입력 정보
- 프로젝트 이름: ${req.name}
- 주제: ${req.topic}
- 클론하고 싶은 기능: ${req.features}
- 난이도 유형: ${levelLabel}
- 사용할 기술: ${techStack}
${gitSection}

## 기술 스택 규칙
${
  hasTechStack
    ? "- 사용자가 지정한 기술 스택을 우선 사용하세요."
    : "- 사용자가 기술 스택을 지정하지 않았으므로 가장 적절한 프레임워크와 라이브러리를 직접 추천하세요."
}

## 출력 규칙
반드시 순수 JSON만 반환하세요.

{
  "clone_coding_title": "",
  "clone_coding_description": "",
  "clone_coding_tech_stack": [],
  "clone_coding_tags": [],
  "clone_coding_difficulty": "",
  "clone_coding_estimated_hours": "",
  "clone_coding_steps": [],
  "clone_coding_project_structure": ""
}
`.trim();
}
