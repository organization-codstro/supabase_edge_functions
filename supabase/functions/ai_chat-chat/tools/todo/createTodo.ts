//기본 todo 만드는 함수

import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { supabaseClient } from "../../../_shared/supabaseClient.ts";
import { Todo, CreateTodoInput } from "../../types/tools.ts";

export const createTodoTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "createTodo",
    description: `새로운 할 일을 생성합니다.
- 사용자가 할 일 추가, 태스크 생성 등을 요청할 때 호출하세요.
- group_id는 초기 컨텍스트에 제공된 그룹 목록에서 찾아 넣으세요.
- 특별한 그룹 언급이 없으면 group_name이 "other"인 그룹의 group_id를 사용하세요.
- 날짜 언급이 없으면 todo_start_date와 todo_end_date 모두 오늘 날짜로 설정하세요.
- project_id, project_page_id는 특별한 언급이 없으면 null로 설정하세요.`,
    parameters: {
      type: "object",
      properties: {
        todo_name: {
          type: "string",
          description: "할 일 이름",
        },
        todo_content: {
          type: "string",
          description: "할 일 내용",
        },
        todo_description: {
          type: "string",
          description: "할 일 상세 설명",
        },
        todo_start_date: {
          type: "string",
          description: "시작 날짜 (YYYY-MM-DD). 언급 없으면 오늘 날짜.",
        },
        todo_end_date: {
          type: "string",
          description: "종료 날짜 (YYYY-MM-DD). 언급 없으면 오늘 날짜.",
        },
        todo_status: {
          type: "string",
          description: "할 일 상태. 기본값: 'waiting'",
          enum: ["waiting", "in progress", "done"],
        },
        group_id: {
          type: "string",
          description:
            "그룹 ID. 초기 컨텍스트의 그룹 목록에서 찾아 넣으세요. 언급 없으면 group_name이 'other'인 그룹 사용.",
        },
        project_id: {
          type: "string",
          description: "프로젝트 ID. 언급 없으면 null.",
        },
        project_page_id: {
          type: "string",
          description: "프로젝트 페이지 ID. 언급 없으면 null.",
        },
      },
      required: [
        "todo_name",
        "todo_content",
        "todo_description",
        "todo_start_date",
        "todo_end_date",
        "todo_status",
        "group_id",
      ],
    },
  },
};

export async function createTodo(input: CreateTodoInput): Promise<Todo> {
  const { data, error } = await supabaseClient
    .from("todos")
    .insert({
      todo_name: input.todo_name,
      todo_content: input.todo_content,
      todo_description: input.todo_description,
      todo_start_date: input.todo_start_date,
      todo_end_date: input.todo_end_date,
      todo_status: input.todo_status,
      group_id: input.group_id,
      project_id: input.project_id ?? null,
      project_page_id: input.project_page_id ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
