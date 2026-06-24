import { proxyActivities } from '@temporalio/workflow';
import {
  DocumentAnalysisSummary,
  DocumentIngestionWorkflowInput,
} from '../types';

const activities = proxyActivities<{
  initializeIngestion(input: DocumentIngestionWorkflowInput): Promise<void>;
  analyzeDocument(
    input: DocumentIngestionWorkflowInput,
  ): Promise<DocumentAnalysisSummary>;
  embedDocumentChunks(input: DocumentIngestionWorkflowInput): Promise<number>;
  finalizeIngestion(
    input: DocumentIngestionWorkflowInput,
    summary: DocumentAnalysisSummary,
  ): Promise<void>;
  failIngestion(
    input: DocumentIngestionWorkflowInput,
    errorMessage: string,
  ): Promise<void>;
}>({
  startToCloseTimeout: '30 minutes',
  retry: {
    maximumAttempts: 3,
  },
});

export async function documentIngestionWorkflow(
  input: DocumentIngestionWorkflowInput,
): Promise<DocumentAnalysisSummary> {
  let summary: DocumentAnalysisSummary = {
    pageCount: 0,
    imageCount: 0,
    chunkCount: 0,
  };

  try {
    await activities.initializeIngestion(input);
    summary = await activities.analyzeDocument(input);
    const embeddedChunkCount = await activities.embedDocumentChunks(input);
    summary = {
      ...summary,
      chunkCount: Math.max(summary.chunkCount, embeddedChunkCount),
    };
    await activities.finalizeIngestion(input, summary);
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await activities.failIngestion(input, message);
    throw error;
  }
}
