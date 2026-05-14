import {
  GenerateStudyPlanRequest,
  GenerateStudyPlanResponse,
  CompanyData,
  AIAnalysisResult,
} from "./types/types.ts";
import {
  generateStudyPlanPrompt,
  extractJobPostingPrompt,
} from "./prompt/prompt.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";
import { chatCompletion } from "../_shared/openaiClient.ts";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Supabase Edge Function: 회사 정보 생성
 */

async function callAI(prompt: string): Promise<string> {
  const response = await chatCompletion([
    {
      role: "system",
      content:
        "당신은 회사 채용 정보를 분석하고 반드시 JSON 형식으로만 응답하는 AI입니다.",
    },
    {
      role: "user",
      content: prompt,
    },
  ]);

  const content = response.choices[0]?.message?.content;

  if (!content) {
    throw new Error("AI 응답이 비어 있습니다.");
  }

  return content;
}

/**
 * 링크가 없는 경우 AI가 채용 공고를 찾음
 */
async function findJobPosting(
  companyName: string,
  jobField: string,
): Promise<string | undefined> {
  try {
    const prompt = extractJobPostingPrompt(companyName, jobField);
    const response = await callAI(prompt);

    // JSON 파싱
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.found ? parsed.url : undefined;
    }
    return undefined;
  } catch (error) {
    console.error("채용 공고 검색 실패:", error);
    return undefined;
  }
}

/**
 * AI가 회사 정보 분석
 */
async function analyzeCompanyInfo(
  companyName: string,
  jobField: string,
  recruitmentType: string,
  officialLink?: string,
): Promise<AIAnalysisResult> {
  try {
    const prompt = generateStudyPlanPrompt(
      companyName,
      jobField,
      recruitmentType,
      officialLink,
    );

    const response = await callAI(prompt);

    // JSON 파싱
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("AI 응답에서 JSON을 찾을 수 없습니다.");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      companyDescription: parsed.companyDescription || "",
      companyValues: parsed.companyValues || "",
      companyWebsite: parsed.companyWebsite,
    };
  } catch (error) {
    console.error("회사 정보 분석 실패:", error);
    throw error;
  }
}

/**
 * DB에 회사 정보 저장
 */
async function saveCompanyToDB(data: CompanyData): Promise<CompanyData> {
  const { data: savedData, error } = await supabaseClient
    .from("companys")
    .insert([data])
    .select()
    .single();

  if (error) {
    throw new Error(`DB 저장 실패: ${error.message}`);
  }

  return savedData;
}

/**
 * 메인 핸들러
 */
export async function handleRequest(req: Request): Promise<Response> {
  try {
    // CORS 처리
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        headers: corsHeaders,
      });
    }

    // POST 요청 검증
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "POST 요청만 허용됩니다.",
        }),
        { status: 405, headers: { "Content-Type": "application/json" } },
      );
    }

    // 요청 데이터 파싱
    const payload: GenerateStudyPlanRequest = await req.json();

    // 필수 필드 검증
    if (
      !payload.userId ||
      !payload.companyName ||
      !payload.jobField ||
      !payload.recruitmentType
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "필수 필드가 누락되었습니다.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // 링크가 없으면 AI가 찾기
    let officialLink = payload.officialLink;
    if (!officialLink) {
      officialLink = await findJobPosting(
        payload.companyName,
        payload.jobField,
      );
    }

    // AI 분석 수행
    const aiResult = await analyzeCompanyInfo(
      payload.companyName,
      payload.jobField,
      payload.recruitmentType,
      officialLink,
    );

    // DB 저장
    const companyData: CompanyData = {
      user_id: payload.userId,
      company_name: payload.companyName,
      company_industry: payload.jobField,
      company_description: aiResult.companyDescription,
      company_values: aiResult.companyValues,
      company_website: aiResult.companyWebsite || officialLink,
    };

    const savedData = await saveCompanyToDB(companyData);

    // 성공 응답
    const response: GenerateStudyPlanResponse = {
      success: true,
      data: savedData,
      message: "스터디 플랜이 성공적으로 생성되었습니다.",
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("오류:", error);

    const response: GenerateStudyPlanResponse = {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "알 수 없는 오류가 발생했습니다.",
    };

    return new Response(JSON.stringify(response), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }
}

Deno.serve(handleRequest);
