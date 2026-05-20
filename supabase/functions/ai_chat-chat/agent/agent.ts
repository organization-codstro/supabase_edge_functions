// ai-chat/agent/agent.ts
import OpenAI from "npm:openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionContentPart,
} from "openai/resources/chat/completions";
import {
  AgentContext,
  AIPersonaInfo,
  CreateTodoInput,
} from "../types/tools.ts";
import { buildSystemPrompt } from "../prompt/prompt.ts";
import {
  getChatHistoryTool,
  getChatHistory,
} from "../tools/chat/getChatHistory.ts";
import {
  getChatMemoryTool,
  getChatMemory,
} from "../tools/chat/getChatMemory.ts";
import { crawlUrlTool, crawlUrl } from "../tools/crawl/crawlUrl.ts";
import { getEmojiTool, getEmoji } from "../tools/emoji/getEmoji.ts";
import { createTodoTool, createTodo } from "../tools/todo/createTodo.ts";
import { getFileUrlTool, getFileUrl } from "../tools/file/getFileUrl.ts";
import {
  getCurrentTimeTool,
  getCurrentTime,
} from "../tools/time/getCurrentTime.ts";
import { getUserInfoTool, getUserInfo } from "../tools/user/getUserInfo.ts";
import { OPENAI_MODEL } from "../../_shared/config.ts";
import { response_format } from "./responseFormat.ts";
import { AgentResponse } from "../types/agent.ts";
import {
  fetchYoutubeTool,
  handleFetchYoutube,
} from "../tools/crawl/Fetchyoutube.ts";

const client = new OpenAI();

const tools = [
  getChatHistoryTool,
  getChatMemoryTool,
  crawlUrlTool,
  getEmojiTool,
  createTodoTool,
  getUserInfoTool,
  getFileUrlTool,
  getCurrentTimeTool,
  fetchYoutubeTool,
];

async function executeTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "getChatHistory":
      return await getChatHistory(args.roomId as string, args.index as number);
    case "getChatMemory":
      return await getChatMemory(args.roomId as string, args.index as number);
    case "crawlUrl":
      return await crawlUrl(args.url as string);
    case "getEmoji":
      return await getEmoji(args.emoticonId as string, args.tag as string);
    case "createTodo":
      return await createTodo(args as unknown as CreateTodoInput);
    case "getUserInfo":
      return await getUserInfo(args.userId as string);
    case "getFileUrl":
      return await getFileUrl(args.path as string);
    case "getCurrentTime":
      return await getCurrentTime(args.country as string);
    case "fetchYoutube":
      return await handleFetchYoutube(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * 유저 메시지에 이미지가 있으면 vision 형식으로 변환
 * chat_message_file_content_path 배열의 path들을 URL로 변환 후 content에 추가
 */
async function buildUserMessageContent(
  userMessage: AgentContext["userMessage"],
): Promise<string | ChatCompletionContentPart[]> {
  const paths = userMessage.chat_message_file_content_path;
  const hasImages = paths && paths.length > 0;

  if (!hasImages) {
    return JSON.stringify(userMessage);
  }

  // 이미지 path → 서명된 URL 병렬 변환
  const imageUrls = await Promise.all(
    paths.map((path: string) => getFileUrl(path)),
  );

  // vision 형식으로 구성 (텍스트 + 이미지 URL들)
  const content: ChatCompletionContentPart[] = [
    {
      type: "text",
      text: JSON.stringify({
        ...userMessage,
        chat_message_file_content_path: undefined,
      }),
    },
    ...imageUrls.map((url) => ({
      type: "image_url" as const,
      image_url: { url },
    })),
  ];

  return content;
}

export async function responseAgent(
  context: AgentContext,
  persona: AIPersonaInfo,
): Promise<AgentResponse> {
  // 유저 메시지에 이미지가 있으면 vision 형식으로 변환
  const userMessageContent = await buildUserMessageContent(context.userMessage);

  // 유저 개인 AI 기록을 조회하여 시스템 프롬프트에 포함
  let userInfoRecords: unknown[] = [];
  try {
    // context.chatRoom.user_id는 buildContext에서 채워집니다
    if (context.chatRoom?.user_id) {
      userInfoRecords = await getUserInfo(context.chatRoom.user_id);
    }
  } catch (err) {
    console.warn("[agent] getUserInfo failed:", err);
    userInfoRecords = [];
  }

  const messages: ChatCompletionMessageParam[] = [
    { role: "system" as const, content: buildSystemPrompt(context, persona) },
    // agent가 사용자 개인 기록(AI 메모리)을 참고할 수 있도록 추가 시스템 정보 제공
    {
      role: "system" as const,
      content: `User AI Records: ${JSON.stringify(userInfoRecords)}`,
    },
    ...context.recentMessages.map((msg) => ({
      role:
        msg.chat_message_sender_type === "AI"
          ? ("assistant" as const)
          : ("user" as const),
      content:
        msg.chat_message_content ??
        "내용이 없는 메세지 입니다, 이모티콘을 전송하였거나 파일을 전송하였으니 확인하여 주세요",
    })),
    {
      role: "user" as const,
      content: userMessageContent,
    },
  ];

  const response = await client.chat.completions.create({
    model: OPENAI_MODEL ?? "gpt-4.1",
    messages,
    tools,
    response_format: response_format,
  });

  let assistantMessage = response.choices[0].message;

  while (
    assistantMessage.tool_calls &&
    assistantMessage.tool_calls.length > 0
  ) {
    const toolResults = await Promise.all(
      assistantMessage.tool_calls.map(async (toolCall) => {
        const args = JSON.parse(toolCall.function.arguments);
        const result = await executeTool(toolCall.function.name, args);
        return {
          role: "tool" as const,
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        };
      }),
    );

    messages.push(
      {
        role: "assistant" as const,
        content: assistantMessage.content ?? "",
        tool_calls: assistantMessage.tool_calls,
      },
      ...toolResults,
    );

    const nextResponse = await client.chat.completions.create({
      model: OPENAI_MODEL ?? "gpt-4.1",
      messages,
      tools,
      response_format: response_format,
    });

    assistantMessage = nextResponse.choices[0].message;
  }

  const content = assistantMessage.content;
  if (!content) throw new Error("Empty response from AI");

  const cleaned = content.replace(/^```json\s*|\s*```$/g, "").trim();
  return JSON.parse(cleaned) as AgentResponse;
}
