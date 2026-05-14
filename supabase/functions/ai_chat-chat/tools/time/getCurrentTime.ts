import type { ChatCompletionTool } from "openai/resources/chat/completions";

const LOCATION_TO_TIMEZONE: Record<string, string> = {
  korea: "Asia/Seoul",
  "south korea": "Asia/Seoul",
  "republic of korea": "Asia/Seoul",
  seoul: "Asia/Seoul",

  japan: "Asia/Tokyo",
  tokyo: "Asia/Tokyo",

  china: "Asia/Shanghai",
  beijing: "Asia/Shanghai",

  india: "Asia/Kolkata",

  "united states": "America/New_York",
  usa: "America/New_York",
  us: "America/New_York",
  "new york": "America/New_York",

  "united kingdom": "Europe/London",
  uk: "Europe/London",
  britain: "Europe/London",
  england: "Europe/London",
  london: "Europe/London",

  germany: "Europe/Berlin",
  berlin: "Europe/Berlin",

  france: "Europe/Paris",
  paris: "Europe/Paris",

  spain: "Europe/Madrid",
  madrid: "Europe/Madrid",

  italy: "Europe/Rome",
  rome: "Europe/Rome",

  brazil: "America/Sao_Paulo",
  canada: "America/Toronto",
  toronto: "America/Toronto",

  australia: "Australia/Sydney",
  sydney: "Australia/Sydney",

  russia: "Europe/Moscow",
  moscow: "Europe/Moscow",

  singapore: "Asia/Singapore",
};

function normalizeLocation(value: string): string {
  return value.trim().toLowerCase();
}

function isValidTimeZone(value: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function resolveTimeZone(location?: string): string | null {
  if (!location) return null;

  const candidate = location.trim();

  if (candidate.includes("/")) {
    if (isValidTimeZone(candidate)) return candidate;

    const normalizedPath = candidate.replace(/\s+/g, "_");
    if (isValidTimeZone(normalizedPath)) {
      return normalizedPath;
    }
  }

  const normalized = normalizeLocation(candidate);

  if (LOCATION_TO_TIMEZONE[normalized]) {
    return LOCATION_TO_TIMEZONE[normalized];
  }

  if (isValidTimeZone(candidate)) {
    return candidate;
  }

  return null;
}

function formatDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const values: Record<string, string> = {
    year: "",
    month: "",
    day: "",
    hour: "",
    minute: "",
    second: "",
  };

  for (const part of parts) {
    if (part.type in values) {
      values[part.type] = part.value;
    }
  }

  if (values.hour === "24") {
    values.hour = "00";
  }

  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

export const getCurrentTimeTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "getCurrentTime",
    description: `현재 시간을 조회합니다.
- location이 지정되면 해당 지역의 대표 시간대(local time)를 반환합니다.
- 국가/도시/IANA timezone(예: Asia/Seoul)을 지원합니다.
- 다중 시간대를 가진 국가는 대표 시간대를 기준으로 반환합니다.
- location이 없거나 인식할 수 없으면 서버 기본 시간대를 사용합니다.`,
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description:
            "선택: 국가명, 도시명 또는 IANA timezone. 예: Korea, Seoul, Japan, Asia/Tokyo",
        },
      },
      required: [],
    },
  },
};

export async function getCurrentTime(location?: string): Promise<{
  location: string | null;
  requestedTimezone: string | null;
  timezone: string;
  currentTime: string;
  utcTime: string;
}> {
  try {
    const serverTimeZone =
      Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

    const requestedTimezone = resolveTimeZone(location);
    const timezone = requestedTimezone ?? serverTimeZone;
    const now = new Date();

    return {
      location: location?.trim() ? location.trim() : null,
      requestedTimezone,
      timezone,
      currentTime: formatDateInTimeZone(now, timezone),
      utcTime: now.toISOString(),
    };
  } catch (error) {
    console.error("[getCurrentTime]:", error);

    const now = new Date();

    return {
      location: location?.trim() ? location.trim() : null,
      requestedTimezone: null,
      timezone: "UTC",
      currentTime: formatDateInTimeZone(now, "UTC"),
      utcTime: now.toISOString(),
    };
  }
}
