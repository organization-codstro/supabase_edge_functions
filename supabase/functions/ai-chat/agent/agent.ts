// ai-chat/agent/agent.ts
import OpenAI from "npm:openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { AgentContext, CreateTodoInput } from "../types/tools.ts";
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

const client = new OpenAI();

const tools = [
  getChatHistoryTool,
  getChatMemoryTool,
  crawlUrlTool,
  getEmojiTool,
  createTodoTool,
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
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function responseAgent(context: AgentContext) {
  // 시스템 프롬프트 + 대화 내역 조합
  const messages: ChatCompletionMessageParam[] = [
    { role: "system" as const, content: buildSystemPrompt(context) },
    ...context.recentMessages.map((msg) => ({
      role:
        msg.chat_message_sender === "AI"
          ? ("assistant" as const)
          : ("user" as const),
      content: msg.chat_message_content,
    })),
    {
      role: "user" as const,
      content: JSON.stringify(context.userMessage),
    },
  ];

  const response = await client.chat.completions.create({
    model: "gpt-4.1",
    messages,
    tools,
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
      model: "gpt-4.1",
      messages,
      tools,
    });

    assistantMessage = nextResponse.choices[0].message;
  }

  return assistantMessage;
}
