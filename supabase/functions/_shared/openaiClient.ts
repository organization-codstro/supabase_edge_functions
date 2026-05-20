// _shared/openaiClient.ts
import OpenAI from "npm:openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { OPENAI_API_KEY } from "./config.ts";

export const client = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

export async function chatCompletion(messages: ChatCompletionMessageParam[]) {
  return await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages,
  });
}
