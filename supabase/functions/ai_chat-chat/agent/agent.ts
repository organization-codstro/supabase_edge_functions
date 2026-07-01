// ai-chat/agent/agent.ts
import OpenAI from "npm:openai";
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import {
  AgentContext,
  AIPersonaInfo,
  CreateTodoInput,
} from "../types/tools.ts";
import { buildSystemPrompt } from "../prompt/prompt.ts";
import {
  getChatHistory,
  getChatHistoryTool,
} from "../tools/chat/getChatHistory.ts";
import {
  getChatMemory,
  getChatMemoryTool,
} from "../tools/chat/getChatMemory.ts";
import { crawlUrl, crawlUrlTool } from "../tools/crawl/crawlUrl.ts";
import { getEmoji, getEmojiTool } from "../tools/emoji/getEmoji.ts";
import { createTodo, createTodoTool } from "../tools/todo/createTodo.ts";
import { getFileUrl, getFileUrlTool } from "../tools/file/getFileUrl.ts";
import {
  getCurrentTime,
  getCurrentTimeTool,
} from "../tools/time/getCurrentTime.ts";
import { getUserInfo, getUserInfoTool } from "../tools/user/getUserInfo.ts";
import { OPENAI_MODEL } from "../../_shared/config.ts";
import { response_format } from "./responseFormat.ts";
import { AgentResponse } from "../types/agent.ts";
import {
  fetchYoutubeTool,
  handleFetchYoutube,
} from "../tools/crawl/Fetchyoutube.ts";
import {
  handleSearchKakaoPlace,
  searchKakaoPlaceTool,
} from "../tools/location/searchKakaoPlace.ts";
import { supabaseClient } from "../../_shared/supabaseClient.ts";

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
  searchKakaoPlaceTool,
];

type MessageAttachment = {
  type?: unknown;
  storagePath?: unknown;
  originalFileName?: unknown;
  mimeType?: unknown;
  fileSizeBytes?: unknown;
  durationMs?: unknown;
};

const MAX_EXTRACTED_FILE_CHARS = 24_000;
const TRANSCRIPTION_MODEL = Deno.env.get("OPENAI_TRANSCRIPTION_MODEL") ??
  "whisper-1";
const TEXT_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-javascript",
  "application/typescript",
  "text/csv",
  "text/html",
  "text/markdown",
  "text/plain",
  "text/xml",
]);
const TEXT_FILE_EXTENSIONS = [
  ".csv",
  ".html",
  ".js",
  ".json",
  ".log",
  ".md",
  ".markdown",
  ".ts",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
];
const PDF_MIME_TYPES = new Set(["application/pdf"]);
const DOCX_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const XLSX_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const PPTX_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

type MessageAttachmentExtraction = {
  chat_message_attachment_id: string;
  attachment_type: string;
  storage_path: string | null;
  original_file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  duration_ms: number | null;
  transcript: string | null;
  extraction_status: string;
  extracted_text: string | null;
  extraction_error: string | null;
};

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
    case "searchKakaoPlace":
      return await handleSearchKakaoPlace(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function getMetadataAttachments(
  userMessage: AgentContext["userMessage"],
): MessageAttachment[] {
  const attachments = userMessage.chat_message_metadata?.attachments;
  if (!Array.isArray(attachments)) return [];
  return attachments as MessageAttachment[];
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isTextLikeAttachment(attachment: MessageAttachment): boolean {
  const mimeType = isString(attachment.mimeType)
    ? attachment.mimeType.toLowerCase()
    : "";
  const fileName = isString(attachment.originalFileName)
    ? attachment.originalFileName.toLowerCase()
    : "";

  return mimeType.startsWith("text/") ||
    TEXT_MIME_TYPES.has(mimeType) ||
    TEXT_FILE_EXTENSIONS.some((extension) => fileName.endsWith(extension));
}

function getAttachmentMimeType(attachment: MessageAttachment) {
  return isString(attachment.mimeType) ? attachment.mimeType.toLowerCase() : "";
}

function getAttachmentFileName(attachment: MessageAttachment) {
  return isString(attachment.originalFileName)
    ? attachment.originalFileName.toLowerCase()
    : "";
}

function getDocumentKind(attachment: MessageAttachment) {
  const mimeType = getAttachmentMimeType(attachment);
  const fileName = getAttachmentFileName(attachment);

  if (PDF_MIME_TYPES.has(mimeType) || fileName.endsWith(".pdf")) return "pdf";
  if (DOCX_MIME_TYPES.has(mimeType) || fileName.endsWith(".docx")) {
    return "docx";
  }
  if (XLSX_MIME_TYPES.has(mimeType) || fileName.endsWith(".xlsx")) {
    return "xlsx";
  }
  if (PPTX_MIME_TYPES.has(mimeType) || fileName.endsWith(".pptx")) {
    return "pptx";
  }

  return null;
}

function truncateExtractedText(text: string) {
  return text.length > MAX_EXTRACTED_FILE_CHARS
    ? `${text.slice(0, MAX_EXTRACTED_FILE_CHARS)}\n\n[truncated: ${
      text.length - MAX_EXTRACTED_FILE_CHARS
    } chars omitted]`
    : text;
}

function formatAttachmentSummary(attachment: MessageAttachment) {
  const lines = [
    `type: ${isString(attachment.type) ? attachment.type : "unknown"}`,
    `name: ${
      isString(attachment.originalFileName)
        ? attachment.originalFileName
        : "(unknown)"
    }`,
    `mimeType: ${
      isString(attachment.mimeType) ? attachment.mimeType : "(unknown)"
    }`,
    `storagePath: ${
      isString(attachment.storagePath) ? attachment.storagePath : "(none)"
    }`,
  ];

  if (typeof attachment.fileSizeBytes === "number") {
    lines.push(`fileSizeBytes: ${attachment.fileSizeBytes}`);
  }
  if (typeof attachment.durationMs === "number") {
    lines.push(`durationMs: ${attachment.durationMs}`);
  }

  return lines.join("\n");
}

async function transcribeAudioAttachment(
  url: string,
  attachment: MessageAttachment,
): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch audio: ${response.status}`);
  }

  const blob = await response.blob();
  const fileName = isString(attachment.originalFileName)
    ? attachment.originalFileName
    : "audio.m4a";
  const mimeType = isString(attachment.mimeType)
    ? attachment.mimeType
    : blob.type || "audio/m4a";
  const file = new File([blob], fileName, { type: mimeType });
  const transcription = await client.audio.transcriptions.create({
    file,
    model: TRANSCRIPTION_MODEL,
  });

  return transcription.text ?? "";
}

async function buildStoredDocumentContext(
  userMessage: AgentContext["userMessage"],
) {
  if (!isString(userMessage.chat_message_id)) return "";

  const { data, error } = await supabaseClient
    .from("chat_message_attachments")
    .select(
      "chat_message_attachment_id, attachment_type, storage_path, original_file_name, mime_type, file_size_bytes, duration_ms, transcript, extraction_status, extracted_text, extraction_error",
    )
    .eq("chat_message_id", userMessage.chat_message_id);

  if (error) {
    console.warn("[agent] attachment extraction 조회 실패:", error);
    return "";
  }

  const rows = (data ?? []) as MessageAttachmentExtraction[];
  const sections = rows
    .map((row, index) => {
      const summary = [
        `attachmentId: ${row.chat_message_attachment_id}`,
        `type: ${row.attachment_type}`,
        `name: ${row.original_file_name ?? "(unknown)"}`,
        `mimeType: ${row.mime_type ?? "(unknown)"}`,
        `storagePath: ${row.storage_path ?? "(none)"}`,
        `extractionStatus: ${row.extraction_status}`,
      ];

      if (typeof row.file_size_bytes === "number") {
        summary.push(`fileSizeBytes: ${row.file_size_bytes}`);
      }
      if (typeof row.duration_ms === "number") {
        summary.push(`durationMs: ${row.duration_ms}`);
      }

      if (row.extraction_status === "completed" && row.extracted_text) {
        return [
          `Stored Attachment ${index + 1}: extracted file text`,
          ...summary,
          "fileText:",
          truncateExtractedText(row.extracted_text),
        ].join("\n");
      }

      if (row.transcript) {
        return [
          `Stored Attachment ${index + 1}: transcript`,
          ...summary,
          "transcript:",
          truncateExtractedText(row.transcript),
        ].join("\n");
      }

      if (row.extraction_status === "failed") {
        return [
          `Stored Attachment ${index + 1}: extraction failed`,
          ...summary,
          `error: ${row.extraction_error ?? "(unknown)"}`,
        ].join("\n");
      }

      if (
        row.extraction_status === "pending" ||
        row.extraction_status === "processing"
      ) {
        return [
          `Stored Attachment ${index + 1}: extraction not ready`,
          ...summary,
          "note: The document extraction job has not completed yet.",
        ].join("\n");
      }

      return null;
    })
    .filter(isString);

  return sections.length > 0 ? sections.join("\n\n---\n\n") : "";
}

async function buildAttachmentContext(
  userMessage: AgentContext["userMessage"],
) {
  const attachments = getMetadataAttachments(userMessage);
  const storedDocumentContext = await buildStoredDocumentContext(userMessage);
  if (attachments.length === 0) {
    return storedDocumentContext
      ? `\n\n[Resolved attachment context]\n${storedDocumentContext}\n[/Resolved attachment context]`
      : "";
  }

  const sections = await Promise.all(
    attachments.map(async (attachment, index) => {
      if (!isString(attachment.storagePath)) return null;
      const type = isString(attachment.type) ? attachment.type : "unknown";

      try {
        const url = await getFileUrl(attachment.storagePath);
        const summary = formatAttachmentSummary(attachment);

        if (type === "audio") {
          const transcript = await transcribeAudioAttachment(url, attachment);
          return [
            `Attachment ${index + 1}: audio transcription`,
            summary,
            "transcript:",
            transcript || "(empty transcript)",
          ].join("\n");
        }

        if (type === "file") {
          const documentKind = getDocumentKind(attachment);
          const isTextFile = isTextLikeAttachment(attachment);

          return [
            `Attachment ${index + 1}: ${
              documentKind ?? (isTextFile ? "text" : "non-text")
            } file`,
            summary,
            "note: File text extraction is handled by chat_message_attachments.extracted_text when available.",
          ].join("\n");
        }

        return [`Attachment ${index + 1}: ${type}`, summary].join("\n");
      } catch (error) {
        return [
          `Attachment ${index + 1}: ${type}`,
          `storagePath: ${attachment.storagePath}`,
          `processingError: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ].join("\n");
      }
    }),
  );

  const allSections = [
    ...sections.filter(isString),
    storedDocumentContext,
  ].filter(isString);
  const content = allSections.join("\n\n---\n\n");
  return content
    ? `\n\n[Resolved attachment context]\n${content}\n[/Resolved attachment context]`
    : "";
}

/**
 * 유저 메시지에 이미지가 있으면 vision 형식으로 변환
 * chat_message_file_content_path 배열의 path들을 URL로 변환 후 content에 추가
 */
async function buildUserMessageContent(
  userMessage: AgentContext["userMessage"],
): Promise<string | ChatCompletionContentPart[]> {
  const paths = Array.isArray(userMessage.chat_message_file_content_path)
    ? userMessage.chat_message_file_content_path
    : [];
  const hasImages = paths && paths.length > 0;
  const attachmentContext = await buildAttachmentContext(userMessage);
  const textPayload = JSON.stringify({
    ...userMessage,
    chat_message_file_content_path: hasImages ? undefined : paths,
  }) + attachmentContext;

  if (!hasImages) {
    return textPayload;
  }

  // 이미지 path → 서명된 URL 병렬 변환
  const imageUrls = await Promise.all(
    paths.map((path: string) => getFileUrl(path)),
  );

  // vision 형식으로 구성 (텍스트 + 이미지 URL들)
  const content: ChatCompletionContentPart[] = [
    {
      type: "text",
      text: textPayload,
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
      role: msg.chat_message_sender_type === "AI"
        ? ("assistant" as const)
        : ("user" as const),
      content: msg.chat_message_content ??
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
