import { proxyActivities } from '@temporalio/workflow';
import {
  DocumentAnalysisSummary,
  DocumentIngestionWorkflowInput,
  DocumentIntelligenceSnapshot,
} from '../types';

const activities = proxyActivities<{
  initializeIngestion(input: DocumentIngestionWorkflowInput): Promise<void>;
  runDocumentIntelligence(
    input: DocumentIngestionWorkflowInput,
  ): Promise<DocumentIntelligenceSnapshot>;
  extractAndClassifyFigures(
    input: DocumentIngestionWorkflowInput,
    snapshot: DocumentIntelligenceSnapshot,
  ): Promise<number>;
  persistDocumentChunks(
    input: DocumentIngestionWorkflowInput,
    snapshot: DocumentIntelligenceSnapshot,
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
    const snapshot = await activities.runDocumentIntelligence(input);
    const imageCount = await activities.extractAndClassifyFigures(input, snapshot);
    summary = await activities.persistDocumentChunks(input, snapshot);
    summary = {
      ...summary,
      imageCount: Math.max(summary.imageCount, imageCount),
    };
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
