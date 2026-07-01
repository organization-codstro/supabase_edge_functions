import { KAKAO_REST_API_KEY } from "../../../_shared/config.ts";

export type KakaoPlaceSearchResult = {
  id: string;
  placeName: string;
  categoryName: string;
  phone: string;
  addressName: string;
  roadAddressName: string;
  longitude: number;
  latitude: number;
  kakaoMapUrl: string;
};

type KakaoPlaceDocument = {
  id: string;
  place_name: string;
  category_name: string;
  phone: string;
  address_name: string;
  road_address_name: string;
  x: string;
  y: string;
  place_url: string;
};

export const searchKakaoPlaceTool = {
  type: "function" as const,
  function: {
    name: "searchKakaoPlace",
    description:
      "카카오 Local API로 장소를 검색합니다. AI가 위치/지도 카드를 보내야 할 때 반드시 먼저 호출하세요. 좌표와 지도 URL은 이 도구 결과만 사용해야 합니다.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "검색할 장소명 또는 주소. 예: 강남역 카페, 카카오 판교아지트",
        },
        longitude: {
          type: "number",
          description:
            "선택. 중심 좌표 경도. 주변 검색이 필요할 때 사용합니다.",
        },
        latitude: {
          type: "number",
          description:
            "선택. 중심 좌표 위도. 주변 검색이 필요할 때 사용합니다.",
        },
        radius: {
          type: "number",
          description:
            "선택. 중심 좌표 기준 반경 meter. Kakao API 기준 최대 20000.",
        },
      },
      required: ["query"],
    },
  },
};

const toPlaceResult = (
  document: KakaoPlaceDocument,
): KakaoPlaceSearchResult => ({
  id: document.id,
  placeName: document.place_name,
  categoryName: document.category_name,
  phone: document.phone,
  addressName: document.address_name,
  roadAddressName: document.road_address_name,
  longitude: Number(document.x),
  latitude: Number(document.y),
  kakaoMapUrl: document.place_url,
});

export async function searchKakaoPlace(args: {
  query: string;
  longitude?: number;
  latitude?: number;
  radius?: number;
}): Promise<KakaoPlaceSearchResult[]> {
  if (!KAKAO_REST_API_KEY) {
    throw new Error("KAKAO_REST_API_KEY 환경변수가 설정되지 않았습니다.");
  }

  const query = args.query?.trim();
  if (!query) throw new Error("query is required.");

  const endpoint = new URL(
    "https://dapi.kakao.com/v2/local/search/keyword.json",
  );
  endpoint.searchParams.set("query", query);
  endpoint.searchParams.set("size", "5");

  if (
    typeof args.longitude === "number" &&
    Number.isFinite(args.longitude) &&
    typeof args.latitude === "number" &&
    Number.isFinite(args.latitude)
  ) {
    endpoint.searchParams.set("x", String(args.longitude));
    endpoint.searchParams.set("y", String(args.latitude));
    if (typeof args.radius === "number" && Number.isFinite(args.radius)) {
      endpoint.searchParams.set("radius", String(Math.min(args.radius, 20000)));
    }
  }

  const response = await fetch(endpoint.toString(), {
    headers: {
      Authorization: `KakaoAK ${KAKAO_REST_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Kakao Local API 오류 [${response.status}]: ${await response.text()}`,
    );
  }

  const data = await response.json();
  const documents = (data.documents ?? []) as KakaoPlaceDocument[];
  return documents.map(toPlaceResult);
}

export async function handleSearchKakaoPlace(
  args: Record<string, unknown>,
): Promise<string> {
  try {
    return JSON.stringify(
      await searchKakaoPlace({
        query: args.query as string,
        longitude: args.longitude as number | undefined,
        latitude: args.latitude as number | undefined,
        radius: args.radius as number | undefined,
      }),
    );
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
