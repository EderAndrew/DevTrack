import type {
  ApplyCurriculumProposalRequest,
  ApplyCurriculumProposalResponse,
  CurriculumAiStatus,
  RequestCurriculumAnalysisRequest,
  RequestCurriculumAnalysisResponse,
} from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

/** "Preencher com IA" on a syllabus document (007 contracts/http-api.md). */
export const curriculumAiApi = {
  getStatus: (documentId: string) => apiClient.get<CurriculumAiStatus>(`/syllabus-documents/${documentId}/ai`),
  requestAnalysis: (documentId: string, body: RequestCurriculumAnalysisRequest = {}) =>
    apiClient.post<RequestCurriculumAnalysisResponse>(`/syllabus-documents/${documentId}/ai-analyses`, body),
  applyProposal: (documentId: string, proposalId: string, body: ApplyCurriculumProposalRequest) =>
    apiClient.post<ApplyCurriculumProposalResponse>(`/syllabus-documents/${documentId}/ai-proposals/${proposalId}/apply`, body),
};
