// ai-chat/tools/file/getFileUrl.ts
import { initializeApp, cert, getApps } from "npm:firebase-admin/app";
import { getStorage } from "npm:firebase-admin/storage";
import {
  FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,
  FIREBASE_STORAGE_BUCKET,
} from "../../../_shared/config.ts";

// Firebase Admin 초기화 (중복 초기화 방지)
if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
    storageBucket: FIREBASE_STORAGE_BUCKET,
  });
}

/**
 * Firebase Storage path → 서명된 다운로드 URL 생성
 * AI가 이미지를 볼 수 있도록 임시 URL 반환 (1시간 유효)
 */
export async function getFileUrl(path: string): Promise<string> {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const bucket = getStorage().bucket();
  const file = bucket.file(path);

  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 60 * 60 * 1000, // 1시간
  });

  return url;
}

export const getFileUrlTool = {
  type: "function" as const,
  function: {
    name: "getFileUrl",
    description:
      "Firebase Storage에 저장된 파일의 path를 받아 AI가 접근 가능한 다운로드 URL을 반환합니다. 유저가 이미지를 첨부했을 때 사용하세요.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Firebase Storage 파일 경로 (예: aichat-assets/roomId/image.png)",
        },
      },
      required: ["path"],
    },
  },
};
