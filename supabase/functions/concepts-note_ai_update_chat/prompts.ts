import type { MaterialRow, NoteConceptRow, NoteRow } from "./index.ts";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/**
 * note_concept 하나에서 실제로 채워진 material과 그 타입을 찾아 반환합니다.
 * (하나의 note_concept에는 material이 딱 하나만 들어옵니다)
 */
function getFilledMaterial(
  c: NoteConceptRow,
): { type: string; material: MaterialRow } | null {
  const candidates: [string, MaterialRow | null][] = [
    ["Concept", c.concept_description_materials],
    ["Tool", c.tool_description_materials],
    ["Library", c.library_description_materials],
    ["Package Manager", c.package_manager_description_materials],
    ["Third-party Service", c.third_party_services_description_materials],
  ];

  for (const [type, material] of candidates) {
    if (material) return { type, material };
  }

  return null;
}

/** material 하나를 읽기 좋은 텍스트 블록으로 변환 */
function formatMaterial(type: string, m: MaterialRow): string {
  const lines: string[] = [`[${type}] ${m.name}`];

  if (m.description) lines.push(`  설명: ${m.description}`);
  if (m.included_language) lines.push(`  언어: ${m.included_language}`);
  if (m.category?.length) lines.push(`  카테고리: ${m.category.join(", ")}`);
  if (m.document_url) lines.push(`  문서: ${m.document_url}`);
  if (m.content) lines.push(`\n${m.content}`);

  return lines.join("\n");
}

// ────────────────────────────────────────────────────────────
// Main prompt builder
// ────────────────────────────────────────────────────────────

export function buildSystemPrompt(note: NoteRow): string {
  // 각 concept에서 채워진 material만 추출하여 목록 구성
  const conceptLines = note.note_concepts
    .map((c, i) => {
      const filled = getFilledMaterial(c);
      if (!filled) return null;
      return `${i + 1}. ${formatMaterial(filled.type, filled.material)}`;
    })
    .filter(Boolean)
    .join("\n\n");

  return `You are an AI assistant helping users manage and improve their technical notes.

## Note Information
- **Title**: ${note.note_title}
- **Labels**: ${note.note_labels?.join(", ") || "없음"}
- **Description**: ${note.note_description || "없음"}

## Note Content (Markdown)
\`\`\`markdown
${note.note_content || "(내용 없음)"}
\`\`\`

## Related Concepts (${note.note_concepts.length}개)
${conceptLines || "(연결된 개념 없음)"}

---

## Your Responsibilities
1. **Answer questions** about the note or any concept, tool, library, package manager, or third-party service listed above.
2. **Modify the note** when the user explicitly requests edits, additions, or restructuring.

## Response Format (STRICT)
You MUST always respond in the following JSON format — no exceptions, no extra text outside the JSON:

\`\`\`json
{
  "reply": "<your response text to the user>",
  "updatedNote": "<full updated markdown string, or null>"
}
\`\`\`

### When to set updatedNote
| User intent | updatedNote |
|---|---|
| Questions, explanations, discussions | \`null\` |
| Edit / add / remove / rewrite note content | Full markdown string (entire note) |

### Intent examples
- "React가 뭐야?", "이 라이브러리 왜 쓰는 거야?" → **질문** → updatedNote: null
- "설치 방법 섹션 추가해줘", "제목 수정해줘", "개요 다시 써줘" → **수정** → updatedNote: <full markdown>

### Quality guidelines
- Preserve all existing content when making edits, unless explicitly asked to remove it.
- Write \`reply\` in the same language the user used (Korean or English).
- Be concise but accurate for technical content.
- When returning \`updatedNote\`, always return the **complete** markdown, not just the changed portion.

IMPORTANT: Always return valid JSON. Escape special characters in the markdown string properly.`;
}
