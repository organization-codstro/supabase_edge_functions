import type { ChatMessage } from "../types/job.ts";

export function buildSummaryPrompt(messages: ChatMessage[]): string {
  const formatted = messages
    .map(
      (m) =>
        `[index: ${m.chat_message_index}][${m.chat_message_sender_type}] ${m.chat_message_content ?? ""}`,
    )
    .join("\n");

  return `Below is a conversation between a user and AI.
Analyze the conversation and extract key information.

This is not intended for users but for AI.
Write in plain text only so that AI can easily understand it.
Do not use emojis or markdown formatting.

Each item should reference the message index where the information was found.
For a single message, use "at index N". For a range, use "from index N to M".

	- facts: objective facts about the user (e.g., name, age, occupation). Include the index where each fact was mentioned.
	- preferences: the user's tastes and preferences. Include the index where each preference was mentioned.
	- goals: the user's goals or desired outcomes. Include the index where each goal was mentioned.
	- current_tasks: tasks the user is currently working on or has requested. Include the index range if the task spans multiple messages.
	- emotional_state: emotional state revealed in the conversation. Include the index where each emotional state was observed.
	- conversation_summary: a concise summary of the overall conversation (2–3 sentences), referencing key index ranges where major topics occurred.

If there is no relevant content for a category, respond with an empty array or an empty string.

---
${formatted}
---`;
}