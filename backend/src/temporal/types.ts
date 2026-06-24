export interface DocumentIngestionWorkflowInput {
  learningId: string;
  userId: string;
  pdfBlobName: string;
  pdfUrl: string;
}

export interface DocumentAnalysisSummary {
  pageCount: number;
  imageCount: number;
  chunkCount: number;
}
