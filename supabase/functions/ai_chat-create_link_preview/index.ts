import { corsHeaders } from "../_shared/cors.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";

type LinkPreview = {
  url: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  imageUrl: string | null;
  imageStoragePath: string | null;
  faviconUrl: string | null;
  status: "ready" | "failed";
};

const MAX_HTML_BYTES = 512_000;
const FETCH_TIMEOUT_MS = 7000;

const isPrivateIpv4 = (host: string) => {
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }

  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a === 0
  );
};

const normalizeUrl = (rawUrl: string) => {
  const trimmed = rawUrl.trim();
  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const url = new URL(candidate);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed.");
  }

  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    isPrivateIpv4(host)
  ) {
    throw new Error("Private or local URLs are not allowed.");
  }

  url.hash = "";
  return url.toString();
};

const decodeHtml = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

const getMetaContent = (html: string, key: string) => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }

  return null;
};

const getTitle = (html: string) => {
  const ogTitle = getMetaContent(html, "og:title");
  if (ogTitle) return ogTitle;

  const twitterTitle = getMetaContent(html, "twitter:title");
  if (twitterTitle) return twitterTitle;

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return titleMatch?.[1]
    ? decodeHtml(titleMatch[1].replace(/\s+/g, " "))
    : null;
};

const getAbsoluteUrl = (value: string | null, baseUrl: string) => {
  if (!value) return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
};

const getFaviconUrl = (html: string, baseUrl: string) => {
  const iconMatch = html.match(
    /<link[^>]+rel=["'][^"']*(?:icon|shortcut icon)[^"']*["'][^>]*>/i,
  );
  const hrefMatch = iconMatch?.[0].match(/href=["']([^"']+)["']/i);
  return getAbsoluteUrl(hrefMatch?.[1] ?? "/favicon.ico", baseUrl);
};

async function fetchHtml(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; CodstroLinkPreview/1.0; +https://codstro.app)",
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL. status=${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) {
      throw new Error("URL did not return HTML content.");
    }

    const reader = response.body?.getReader();
    if (!reader) return await response.text();

    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      if (received > MAX_HTML_BYTES) break;
      chunks.push(value);
    }

    return new TextDecoder().decode(
      chunks.reduce((acc, chunk) => {
        const next = new Uint8Array(acc.length + chunk.length);
        next.set(acc);
        next.set(chunk, acc.length);
        return next;
      }, new Uint8Array()),
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function getOrCreatePreview(rawUrl: string): Promise<LinkPreview> {
  const url = normalizeUrl(rawUrl);

  const { data: cached, error: cacheError } = await supabaseClient
    .from("chat_link_previews")
    .select("*")
    .eq("url", url)
    .maybeSingle();

  if (cacheError) throw new Error(cacheError.message);
  if (cached?.status === "ready") {
    return {
      url: cached.url,
      title: cached.title,
      description: cached.description,
      siteName: cached.site_name,
      imageUrl: cached.image_url,
      imageStoragePath: cached.image_storage_path,
      faviconUrl: cached.favicon_url,
      status: "ready",
    };
  }

  try {
    const html = await fetchHtml(url);
    const title = getTitle(html);
    const description = getMetaContent(html, "og:description") ??
      getMetaContent(html, "description") ??
      getMetaContent(html, "twitter:description");
    const siteName = getMetaContent(html, "og:site_name") ??
      new URL(url).hostname.replace(/^www\./, "");
    const imageUrl = getAbsoluteUrl(
      getMetaContent(html, "og:image") ??
        getMetaContent(html, "twitter:image"),
      url,
    );
    const faviconUrl = getFaviconUrl(html, url);

    const preview: LinkPreview = {
      url,
      title,
      description,
      siteName,
      imageUrl,
      imageStoragePath: null,
      faviconUrl,
      status: "ready",
    };

    const { error } = await supabaseClient.from("chat_link_previews").upsert({
      url,
      title,
      description,
      site_name: siteName,
      image_url: imageUrl,
      image_storage_path: null,
      favicon_url: faviconUrl,
      status: "ready",
      fetched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) throw new Error(error.message);
    return preview;
  } catch (error) {
    await supabaseClient.from("chat_link_previews").upsert({
      url,
      status: "failed",
      fetched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const preview = await getOrCreatePreview(url);
    return new Response(JSON.stringify({ success: true, preview }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ai_chat-create_link_preview]", message);

    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
