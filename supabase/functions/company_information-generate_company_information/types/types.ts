/**
 * 스터디 플랜 생성 함수 - 타입 정의
 */

export interface GenerateStudyPlanRequest {
  userId: string;
  companyName: string;
  jobField: string;
  recruitmentType: "신입" | "인턴" | "경력";
  officialLink?: string;
}

export interface CompanyData {
  company_id?: string;
  user_id: string;
  company_name: string;
  company_industry: string;
  company_description: string;
  company_website?: string;
  company_values: string;
  created_at?: string;
  updated_at?: string;
}

export interface GenerateStudyPlanResponse {
  success: boolean;
  data?: CompanyData;
  error?: string;
  message?: string;
}

export interface AIAnalysisResult {
  companyDescription: string;
  companyValues: string;
  companyWebsite?: string;
}
