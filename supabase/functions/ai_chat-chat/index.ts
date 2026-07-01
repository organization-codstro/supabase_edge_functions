// index.ts

import { supabaseClient } from "../_shared/supabaseClient.ts";
import { SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/config.ts";
import { responseAgent } from "./agent/agent.ts";
import buildContext from "./context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const toUuid = (val: string | null | undefined): string | null =>
  val?.trim() || null;

const toArray = (val: string[] | null | undefined): string[] | null =>
  val?.length ? val : null;

const normalizeMessageFormat = (
  format: string | null | undefined,
  hasEmoticon: boolean,
): "TEXT" | "IMG" | "MULTIMODAL" => {
  if (hasEmoticon) return "IMG";
  if (format === "TEXT" || format === "IMG" || format === "MULTIMODAL") {
    return format;
  }
  return "TEXT";
};

const normalizeMetadata = (
  metadata: unknown,
): {
  version: number;
  attachments: Array<Record<string, unknown>>;
  client: { platform: string };
} => {
  if (!metadata || typeof metadata !== "object") {
    return {
      version: 1,
      attachments: [],
      client: { platform: "edge_function" },
    };
  }

  const candidate = metadata as {
    version?: unknown;
    attachments?: unknown;
    client?: unknown;
  };

  return {
    version: typeof candidate.version === "number" ? candidate.version : 1,
    attachments: Array.isArray(candidate.attachments)
      ? candidate.attachments.filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === "object" && !Array.isArray(item),
      )
      : [],
    client: {
      platform: typeof candidate.client === "object" &&
          candidate.client !== null &&
          "platform" in candidate.client &&
          typeof candidate.client.platform === "string"
        ? candidate.client.platform
        : "edge_function",
    },
  };
};

const getLocationAttachments = (
  metadata: ReturnType<typeof normalizeMetadata>,
) =>
  metadata.attachments.filter((attachment) =>
    attachment.type === "location" &&
    typeof attachment.kakaoMapUrl === "string" &&
    typeof attachment.placeName === "string"
  );

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
const DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
const DOCUMENT_FILE_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".xlsx",
  ".pptx",
];

function isExtractableAttachment(attachment: Record<string, unknown>) {
  if (typeof attachment.storagePath !== "string") return false;
  const type = typeof attachment.type === "string" ? attachment.type : "";
  const mimeType = typeof attachment.mimeType === "string"
    ? attachment.mimeType.toLowerCase()
    : "";
  const fileName = typeof attachment.originalFileName === "string"
    ? attachment.originalFileName.toLowerCase()
    : "";

  if (type !== "file") return false;

  return mimeType.startsWith("text/") ||
    TEXT_MIME_TYPES.has(mimeType) ||
    DOCUMENT_MIME_TYPES.has(mimeType) ||
    TEXT_FILE_EXTENSIONS.some((extension) => fileName.endsWith(extension)) ||
    DOCUMENT_FILE_EXTENSIONS.some((extension) => fileName.endsWith(extension));
}

function isSupportedAttachment(attachment: Record<string, unknown>) {
  const type = typeof attachment.type === "string" ? attachment.type : "";
  return ["file", "audio", "image", "camera_image"].includes(type) &&
    typeof attachment.storagePath === "string";
}

async function resolveUserMessageId(
  chatRoomId: string,
  userMessage: Record<string, unknown>,
): Promise<string | null> {
  if (typeof userMessage.chat_message_id === "string") {
    return userMessage.chat_message_id;
  }

  if (typeof userMessage.chat_message_index !== "number") return null;

  const { data, error } = await supabaseClient
    .from("chat_messages")
    .select("chat_message_id")
    .eq("chat_room_id", chatRoomId)
    .eq("chat_message_sender_type", "USER")
    .eq("chat_message_index", userMessage.chat_message_index)
    .maybeSingle();

  if (error) {
    console.warn("[ai-chat] user message id 조회 실패:", error);
    return null;
  }

  return typeof data?.chat_message_id === "string"
    ? data.chat_message_id
    : null;
}

function toNullableString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function ensureMessageAttachments(
  chatRoomId: string,
  userMessage: Record<string, unknown>,
) {
  const metadata = normalizeMetadata(userMessage.chat_message_metadata);
  const attachments = metadata.attachments.filter(isSupportedAttachment);
  if (attachments.length === 0) return [];

  const chatMessageId = await resolveUserMessageId(chatRoomId, userMessage);
  if (!chatMessageId) {
    console.warn("[ai-chat] 첨부 row 생성 스킵: user message id 없음");
    return [];
  }

  userMessage.chat_message_id = chatMessageId;

  const rows = [];
  for (const attachment of attachments) {
    const storagePath = attachment.storagePath as string;
    const { data: existing, error: selectError } = await supabaseClient
      .from("chat_message_attachments")
      .select("chat_message_attachment_id, extraction_status")
      .eq("chat_message_id", chatMessageId)
      .eq("storage_path", storagePath)
      .maybeSingle();

    if (selectError) {
      console.warn("[ai-chat] attachment 조회 실패:", selectError);
      continue;
    }

    if (existing) {
      rows.push({
        chat_message_attachment_id: existing.chat_message_attachment_id,
        extraction_status: existing.extraction_status,
        shouldExtract: isExtractableAttachment(attachment) &&
          ["pending", "failed"].includes(existing.extraction_status),
      });
      continue;
    }

    const shouldExtract = isExtractableAttachment(attachment);
    const { data: inserted, error: insertError } = await supabaseClient
      .from("chat_message_attachments")
      .insert({
        chat_message_id: chatMessageId,
        chat_room_id: chatRoomId,
        attachment_type: toNullableString(attachment.type) ?? "file",
        storage_provider: toNullableString(attachment.storageProvider) ??
          "firebase",
        storage_path: storagePath,
        thumbnail_storage_path: toNullableString(
          attachment.thumbnailStoragePath,
        ),
        original_file_name: toNullableString(attachment.originalFileName),
        mime_type: toNullableString(attachment.mimeType),
        file_size_bytes: toNullableNumber(attachment.fileSizeBytes),
        width: toNullableNumber(attachment.width),
        height: toNullableNumber(attachment.height),
        duration_ms: toNullableNumber(attachment.durationMs),
        transcript: toNullableString(attachment.transcript),
        extraction_status: shouldExtract ? "pending" : "not_required",
        provider_metadata: attachment,
      })
      .select("chat_message_attachment_id, extraction_status")
      .single();

    if (insertError) {
      console.warn("[ai-chat] attachment 저장 실패:", insertError);
      continue;
    }

    rows.push({
      chat_message_attachment_id: inserted.chat_message_attachment_id,
      extraction_status: inserted.extraction_status,
      shouldExtract,
    });
  }

  return rows;
}

async function triggerDocumentExtractions(
  attachments: Array<{
    chat_message_attachment_id: string;
    shouldExtract: boolean;
  }>,
) {
  const targets = attachments.filter((attachment) => attachment.shouldExtract);
  if (targets.length === 0) return;

  const results = await Promise.allSettled(
    targets.map((attachment) =>
      fetch(`${SUPABASE_URL}/functions/v1/ai_chat-extract_document`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          chat_message_attachment_id: attachment.chat_message_attachment_id,
        }),
      }).then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `extract_document failed: ${response.status} ${await response
              .text()}`,
          );
        }
      })
    ),
  );

  results.forEach((result) => {
    if (result.status === "rejected") {
      console.warn("[ai-chat] document extraction 호출 실패:", result.reason);
    }
  });
}

async function prepareUserMessageAttachments(
  chatRoomId: string,
  userMessage: Record<string, unknown>,
) {
  const attachments = await ensureMessageAttachments(chatRoomId, userMessage);
  await triggerDocumentExtractions(attachments);
}

async function saveLocationPreviews(
  chatMessageId: string,
  metadata: ReturnType<typeof normalizeMetadata>,
) {
  const locations = getLocationAttachments(metadata);
  if (locations.length === 0) return;

  const { error } = await supabaseClient.from("chat_location_previews").insert(
    locations.map((location) => ({
      chat_message_id: chatMessageId,
      provider: typeof location.provider === "string"
        ? location.provider
        : "kakao",
      place_name: location.placeName,
      address_name: typeof location.addressName === "string"
        ? location.addressName
        : null,
      road_address_name: typeof location.roadAddressName === "string"
        ? location.roadAddressName
        : null,
      latitude: typeof location.latitude === "number"
        ? location.latitude
        : null,
      longitude: typeof location.longitude === "number"
        ? location.longitude
        : null,
      kakao_place_id: typeof location.kakaoPlaceId === "string"
        ? location.kakaoPlaceId
        : null,
      kakao_map_url: location.kakaoMapUrl,
      thumbnail_storage_path: typeof location.thumbnailStoragePath === "string"
        ? location.thumbnailStoragePath
        : null,
    })),
  );

  if (error) {
    console.error("[ai-chat] location preview 저장 실패:", error);
  }
}

async function broadcast(chat_room_id: string, payload: object) {
  await supabaseClient
    .channel(`room_typing_${chat_room_id}`)
    .httpSend("typing", payload);
}

async function validateEmoticonId(
  emoticonId: string | null,
): Promise<string | null> {
  if (!emoticonId) return null;

  const { data } = await supabaseClient
    .from("emoticons")
    .select("emoticon_id")
    .eq("emoticon_id", emoticonId)
    .maybeSingle();

  if (!data) {
    console.warn(`[ai-chat] emoticon_id ${emoticonId} not found → null`);
  }

  return data ? emoticonId : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { chat_room_id, userMessage } = await req.json();

    await prepareUserMessageAttachments(chat_room_id, userMessage);

    const context = await buildContext(chat_room_id, userMessage);

    console.log(
      "[ai-chat] personas:",
      context.personas.map((p) => p.baseInfo.ai_persona_name),
    );

    const targetAgentId = userMessage.chat_message_mention_target_agent_id;

    console.log("[ai-chat] targetAgentId:", targetAgentId);
    console.log(
      "[ai-chat] persona ids:",
      context.personas.map((p) => ({
        chat_room_ai_id: p.chat_room_ai_id,
        ai_persona_id: p.baseInfo.ai_persona_id,
      })),
    );

    const respondingPersonas = targetAgentId
      ? context.personas.filter((p) => p.chat_room_ai_id === targetAgentId)
      : context.personas;

    console.log(
      "[ai-chat] responding personas:",
      respondingPersonas.map((p) => p.baseInfo.ai_persona_name),
    );

    await broadcast(chat_room_id, {
      type: "typing_start",
      personas: respondingPersonas.map((p) => ({
        chat_room_ai_id: p.chat_room_ai_id,
        persona_name: p.baseInfo.ai_persona_name,
      })),
    });

    const results = await Promise.allSettled(
      respondingPersonas.map((persona) => responseAgent(context, persona)),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const persona = respondingPersonas[i];

      if (result.status === "rejected") {
        console.error(
          `[ai-chat] ${persona.baseInfo.ai_persona_name} 응답 실패:`,
          result.reason,
        );

        await broadcast(chat_room_id, {
          type: "typing_end",
          chat_room_ai_id: persona.chat_room_ai_id,
        });

        continue;
      }

      const aiResponse = result.value;
      const metadata = normalizeMetadata(aiResponse.chat_message_metadata);

      const validatedEmoticonId = await validateEmoticonId(
        toUuid(aiResponse.emoticon_id),
      );

      if (!aiResponse.chat_message_content && !validatedEmoticonId) {
        console.error(
          `[ai-chat] ${persona.baseInfo.ai_persona_name} 응답 내용과 이모지 모두 비어있음 → 저장 스킵`,
        );
        await broadcast(chat_room_id, {
          type: "typing_end",
          chat_room_ai_id: persona.chat_room_ai_id,
        });
        continue;
      }

      const { data, error } = await supabaseClient
        .from("chat_messages")
        .insert({
          chat_room_id,
          chat_message_sender_type: "AI",
          chat_message_sender_agent_id: persona.chat_room_ai_id,
          chat_message_content: aiResponse.chat_message_content,
          chat_message_format: normalizeMessageFormat(
            aiResponse.chat_message_format,
            !!validatedEmoticonId,
          ),
          chat_message_interaction_type:
            aiResponse.chat_message_interaction_type || "CASUAL",
          emoticon_id: validatedEmoticonId,
          chat_message_file_content_path: toArray(
            aiResponse.chat_message_file_content_path,
          ),
          chat_message_metadata: metadata,
          chat_message_reply_message_id: toUuid(
            aiResponse.chat_message_reply_message_id,
          ),
          chat_message_reply_target_agent_id: toUuid(
            aiResponse.chat_message_reply_target_agent_id,
          ),
          chat_message_mention_target_agent_id: toUuid(
            aiResponse.chat_message_mention_target_agent_id,
          ),
        })
        .select("chat_message_id, chat_message_index")
        .single();

      if (error) {
        console.error(
          `[ai-chat] ${persona.baseInfo.ai_persona_name} 저장 실패:`,
          error,
        );

        await broadcast(chat_room_id, {
          type: "typing_end",
          chat_room_ai_id: persona.chat_room_ai_id,
        });

        continue;
      }

      await saveLocationPreviews(data.chat_message_id as string, metadata);

      const lastMessageIndex = data.chat_message_index as number;
      console.log("현제 진행중인 index : ", lastMessageIndex);

      await broadcast(chat_room_id, {
        type: "typing_end",
        chat_room_ai_id: persona.chat_room_ai_id,
      });

      console.log(
        `[ai-chat] ${persona.baseInfo.ai_persona_name} 저장 완료 (index: ${lastMessageIndex})`,
      );

      if (lastMessageIndex > 0 && lastMessageIndex % 50 === 0) {
        console.log("ai_chat-create_chat_memory_job 호출");
        fetch(
          `${
            Deno.env.get("SUPABASE_URL")
          }/functions/v1/ai_chat-create_chat_memory_job`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ chat_room_id }),
          },
        ).catch((err) => console.error("create-memory-job call failed:", err));
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        count: respondingPersonas.length,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    console.error(err);

    const errorMessage = err instanceof Error ? err.message : String(err);

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }
});
