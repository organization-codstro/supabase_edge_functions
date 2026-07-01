import * as pdfjsLib from "npm:pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "npm:mammoth";
import * as XLSX from "npm:xlsx";
import JSZip from "npm:jszip";
import { corsHeaders } from "../_shared/cors.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";
import { getFileUrl } from "../ai_chat-chat/tools/file/getFileUrl.ts";

const MAX_STORED_DOCUMENT_CHARS = 120_000;

type AttachmentRow = {
  chat_message_attachment_id: string;
  storage_path: string | null;
  original_file_name: string | null;
  mime_type: string | null;
  extraction_attempt_count: number;
};

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

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function truncateForStorage(text: string) {
  return text.length > MAX_STORED_DOCUMENT_CHARS
    ? `${text.slice(0, MAX_STORED_DOCUMENT_CHARS)}\n\n[truncated: ${
      text.length - MAX_STORED_DOCUMENT_CHARS
    } chars omitted]`
    : text;
}

function getDocumentKind(row: AttachmentRow) {
  const mimeType = row.mime_type?.toLowerCase() ?? "";
  const fileName = row.original_file_name?.toLowerCase() ?? "";

  if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
    return "pdf";
  }
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileName.endsWith(".docx")
  ) {
    return "docx";
  }
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    fileName.endsWith(".xlsx")
  ) {
    return "xlsx";
  }
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    fileName.endsWith(".pptx")
  ) {
    return "pptx";
  }
  if (
    mimeType.startsWith("text/") ||
    TEXT_MIME_TYPES.has(mimeType) ||
    [
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
    ].some((extension) => fileName.endsWith(extension))
  ) {
    return "text";
  }

  return null;
}

async function fetchArrayBuffer(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.status}`);
  }
  return await response.arrayBuffer();
}

async function extractText(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch text file: ${response.status}`);
  }
  return await response.text();
}

async function extractPdfText(url: string) {
  const arrayBuffer = await fetchArrayBuffer(url);
  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
  }).promise;

  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => "str" in item ? item.str : "")
      .filter(Boolean)
      .join(" ");
    pages.push([`# Page ${pageNumber}`, text].join("\n"));
  }

  return pages.join("\n\n---\n\n");
}

async function extractDocxText(url: string) {
  const arrayBuffer = await fetchArrayBuffer(url);
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value ?? "";
}

async function extractXlsxText(url: string) {
  const arrayBuffer = await fetchArrayBuffer(url);
  const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    return [`# Sheet: ${sheetName}`, csv].join("\n");
  }).join("\n\n---\n\n");
}

function decodeXmlText(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(
      /&#x([0-9a-fA-F]+);/g,
      (_match, code) => String.fromCharCode(Number.parseInt(code, 16)),
    );
}

function getPptxSlideNumber(path: string) {
  const match = path.match(/slide(\d+)\.xml$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

async function extractPptxText(url: string) {
  const arrayBuffer = await fetchArrayBuffer(url);
  const zip = await JSZip.loadAsync(arrayBuffer);
  const slideFiles = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => getPptxSlideNumber(a) - getPptxSlideNumber(b));

  const sections = await Promise.all(
    slideFiles.map(async (path) => {
      const xml = await zip.files[path].async("text");
      const texts = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)]
        .map((match) => decodeXmlText(match[1]).trim())
        .filter(Boolean);
      return [`# Slide ${getPptxSlideNumber(path)}`, texts.join("\n")].join(
        "\n",
      );
    }),
  );

  return sections.join("\n\n---\n\n");
}

async function extractDocumentText(row: AttachmentRow, url: string) {
  const kind = getDocumentKind(row);

  switch (kind) {
    case "text":
      return await extractText(url);
    case "pdf":
      return await extractPdfText(url);
    case "docx":
      return await extractDocxText(url);
    case "xlsx":
      return await extractXlsxText(url);
    case "pptx":
      return await extractPptxText(url);
    default:
      throw new Error("Unsupported document type");
  }
}

async function markFailed(attachmentId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await supabaseClient
    .from("chat_message_attachments")
    .update({
      extraction_status: "failed",
      extraction_error: message.slice(0, 4000),
      updated_at: new Date().toISOString(),
    })
    .eq("chat_message_attachment_id", attachmentId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let attachmentId = "";

  try {
    const body = await req.json();
    attachmentId = typeof body.chat_message_attachment_id === "string"
      ? body.chat_message_attachment_id
      : "";

    if (!attachmentId) {
      return jsonResponse(
        { error: "chat_message_attachment_id is required" },
        400,
      );
    }

    const { data, error } = await supabaseClient
      .from("chat_message_attachments")
      .select(
        "chat_message_attachment_id, storage_path, original_file_name, mime_type, extraction_attempt_count",
      )
      .eq("chat_message_attachment_id", attachmentId)
      .single();

    if (error || !data) {
      return jsonResponse(
        { error: error?.message ?? "Attachment not found" },
        404,
      );
    }

    const attachment = data as AttachmentRow;
    if (!attachment.storage_path) {
      throw new Error("Attachment has no storage_path");
    }

    await supabaseClient
      .from("chat_message_attachments")
      .update({
        extraction_status: "processing",
        extraction_error: null,
        extraction_started_at: new Date().toISOString(),
        extraction_attempt_count: (attachment.extraction_attempt_count ?? 0) +
          1,
        updated_at: new Date().toISOString(),
      })
      .eq("chat_message_attachment_id", attachmentId);

    const url = await getFileUrl(attachment.storage_path);
    const extractedText = truncateForStorage(
      await extractDocumentText(attachment, url),
    );

    const { error: updateError } = await supabaseClient
      .from("chat_message_attachments")
      .update({
        extraction_status: "completed",
        extracted_text: extractedText,
        extraction_error: null,
        extracted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("chat_message_attachment_id", attachmentId);

    if (updateError) throw updateError;

    return jsonResponse({
      success: true,
      chat_message_attachment_id: attachmentId,
      chars: extractedText.length,
    });
  } catch (error) {
    if (attachmentId) await markFailed(attachmentId, error);
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500);
  }
});
