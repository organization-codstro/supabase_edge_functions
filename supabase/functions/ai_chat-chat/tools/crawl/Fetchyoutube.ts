// fetchYoutube.ts — Supabase Edge Function (Deno)
// YouTube Data API v3로 영상 메타데이터를 가져오는 툴

import { YoutubeResult } from "../../types/tools.ts";

// ─── Tool Definition (OpenAI SDK 형식) ───────────────────────────────────────

export const fetchYoutubeTool = {
  type: "function" as const,
  function: {
    name: "fetchYoutube",
    description:
      "YouTube URL에서 영상 메타데이터(제목, 설명, 채널명, 조회수, 좋아요 수, 태그, 썸네일)를 가져옵니다. " +
      "메시지에 youtube.com 또는 youtu.be URL이 포함되면 호출하세요.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "YouTube 영상 URL",
        },
      },
      required: ["url"],
    },
  },
};

// ─── Video ID Extraction ──────────────────────────────────────────────────────

function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes("youtube.com")) {
      // /watch?v=
      const v = parsed.searchParams.get("v");
      if (v) return v;

      // /shorts/ or /embed/
      const match = parsed.pathname.match(
        /\/(shorts|embed)\/([A-Za-z0-9_-]{11})/,
      );
      if (match) return match[2];
    }

    // youtu.be/VIDEO_ID
    if (parsed.hostname === "youtu.be") {
      const id = parsed.pathname.slice(1).split("?")[0];
      if (id.length === 11) return id;
    }
  } catch {
    // fallback regex
    const match = url.match(
      /(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/,
    );
    if (match) return match[1];
  }

  return null;
}

// ─── Core Fetcher ─────────────────────────────────────────────────────────────

export async function fetchYoutube(url: string): Promise<YoutubeResult> {
  // Supabase Edge Function 환경변수
  const apiKey = Deno.env.get("YOUTUBE_API_KEY");
  if (!apiKey)
    throw new Error("YOUTUBE_API_KEY 환경변수가 설정되지 않았습니다.");

  const videoId = extractVideoId(url);
  if (!videoId) throw new Error(`영상 ID 추출 실패: ${url}`);

  const endpoint = new URL("https://www.googleapis.com/youtube/v3/videos");
  endpoint.searchParams.set("part", "snippet,statistics");
  endpoint.searchParams.set("id", videoId);
  endpoint.searchParams.set("key", apiKey);

  const res = await fetch(endpoint.toString());
  if (!res.ok) {
    throw new Error(`YouTube API 오류 [${res.status}]: ${await res.text()}`);
  }

  const data = await res.json();

  if (!data.items?.length) {
    throw new Error(`영상을 찾을 수 없습니다 (videoId: ${videoId})`);
  }

  const { snippet, statistics } = data.items[0];

  return {
    videoId,
    url,
    title: snippet.title,
    description: snippet.description,
    channelName: snippet.channelTitle,
    viewCount: statistics.viewCount ?? "0",
    likeCount: statistics.likeCount ?? "0",
    tags: snippet.tags ?? [],
    thumbnail:
      snippet.thumbnails.maxres?.url ??
      snippet.thumbnails.high?.url ??
      snippet.thumbnails.default.url,
    publishedAt: snippet.publishedAt,
  };
}

// ─── Tool Call Handler ────────────────────────────────────────────────────────

export async function handleFetchYoutube(
  args: Record<string, unknown>,
): Promise<string> {
  const { url } = args as { url: string };
  if (!url) return JSON.stringify({ error: "url이 필요합니다." });

  try {
    return JSON.stringify(await fetchYoutube(url));
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
