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
import { buildSystemPrompt } from "./prompt.ts";
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
  getFileUrlTool,
  fetchYoutubeTool,
];

async function executeTool(name: string, args: Record<string, any>) {
  switch (name) {
    case "getChatHistory":
      return await getChatHistory(args.roomId, args.index);
    case "getChatMemory":
      return await getChatMemory(args.roomId, args.index);
    case "crawlUrl":
      return await crawlUrl(args.url);
    case "getEmoji":
      return await getEmoji(args.emoticonId, args.tag);
    case "createTodo":
      return await createTodo(args as CreateTodoInput);
    case "getFileUrl":
      return await getFileUrl(args.path);
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

  const messages: ChatCompletionMessageParam[] = [
    { role: "system" as const, content: buildSystemPrompt(context, persona) },
    ...context.recentMessages.map((msg) => ({
      role:
        msg.chat_message_sender_type === "AI"
          ? ("assistant" as const)
          : ("user" as const),
      content: msg.chat_message_content,
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
