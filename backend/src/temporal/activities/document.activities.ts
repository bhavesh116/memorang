import { Injectable, Logger } from '@nestjs/common';
import { AzureService } from '../../azure/azure.service';
import { AzureOpenAiService } from '../../azure-openai/azure-openai.service';
import {
  DocumentAnalysisResult,
  DocumentIntelligenceService,
  DocumentParagraph,
} from '../../document-intelligence/document-intelligence.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { DocumentAnalysisSummary } from '../types';

interface IngestionContext {
  learningId: string;
  userId: string;
  pdfBlobName: string;
  pdfUrl: string;
}

interface PersistedImageRow {
  id: string;
  page_number: number | null;
}

interface ChunkSeed {
  pageNumber: number;
  sectionTitle: string | null;
  chunkText: string;
}

@Injectable()
export class DocumentActivities {
  private readonly logger = new Logger(DocumentActivities.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly documentIntelligenceService: DocumentIntelligenceService,
    private readonly azureOpenAiService: AzureOpenAiService,
    private readonly azureService: AzureService,
  ) {}

  async initializeIngestion(context: IngestionContext): Promise<void> {
    await this.clearExistingArtifacts(context.learningId);
    await this.updateLearning(context.learningId, {
      ingestion_status: 'queued',
      ingestion_progress_pct: 5,
      ingestion_eta_seconds: null,
      ingestion_error: null,
      ingestion_started_at: new Date().toISOString(),
      ingestion_completed_at: null,
      document_page_count: null,
      document_image_count: null,
      plan_status: 'not_started',
      plan_error: null,
      active_plan_id: null,
    });
    await this.logEvent(context.learningId, 'queued', 'Document queued for ingestion');
  }

  async analyzeDocument(context: IngestionContext): Promise<DocumentAnalysisSummary> {
    await this.updateLearning(context.learningId, {
      ingestion_status: 'analyzing',
      ingestion_progress_pct: 15,
      ingestion_eta_seconds: 180,
      ingestion_error: null,
    });
    await this.logEvent(context.learningId, 'analyzing', 'Document analysis started');

    const { operationLocation, result } =
      await this.documentIntelligenceService.analyzePdfFromUrl(context.pdfUrl);

    const pageCount = result.pages?.length ?? 0;
    const images = await this.extractAndPersistImages(
      context,
      result,
      operationLocation,
    );
    const chunks = this.buildChunks(result, images);

    if (chunks.length > 0) {
      const chunkRows = chunks.map((chunk, index) => ({
        learning_id: context.learningId,
        chunk_index: index,
        page_number: chunk.pageNumber,
        section_title: chunk.sectionTitle,
        chunk_text: chunk.chunkText,
        image_ids: images
          .filter((image) => image.page_number === chunk.pageNumber)
          .map((image) => image.id),
        metadata: {
          pageNumber: chunk.pageNumber,
          source: 'document_intelligence',
        },
      }));

      const { error } = await this.supabaseService.client
        .from('learning_document_chunks')
        .insert(chunkRows);

      if (error) {
        throw new Error(`Failed to persist chunks: ${error.message}`);
      }
    }

    const summary = {
      pageCount,
      imageCount: images.length,
      chunkCount: chunks.length,
    };

    await this.updateLearning(context.learningId, {
      ingestion_status: 'embedding',
      ingestion_progress_pct: 60,
      ingestion_eta_seconds: this.estimateEmbeddingEta(chunks.length),
      document_page_count: summary.pageCount,
      document_image_count: summary.imageCount,
    });
    await this.logEvent(
      context.learningId,
      'analyzed',
      `Document analysis completed with ${summary.pageCount} pages, ${summary.imageCount} images, and ${summary.chunkCount} chunks`,
      summary,
    );

    return summary;
  }

  async embedDocumentChunks(context: IngestionContext): Promise<number> {
    const { data: chunks, error } = await this.supabaseService.client
      .from('learning_document_chunks')
      .select('id, chunk_text')
      .eq('learning_id', context.learningId)
      .order('chunk_index', { ascending: true });

    if (error) {
      throw new Error(`Failed to load chunks for embeddings: ${error.message}`);
    }

    if (!chunks || chunks.length === 0) {
      await this.updateLearning(context.learningId, {
        ingestion_progress_pct: 90,
        ingestion_eta_seconds: 10,
      });
      return 0;
    }

    const batchSize = 8;
    let completed = 0;

    for (let index = 0; index < chunks.length; index += batchSize) {
      const batch = chunks.slice(index, index + batchSize);
      const embeddings = await this.azureOpenAiService.embedTexts(
        batch.map((chunk) => String(chunk.chunk_text)),
      );

      for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
        const chunk = batch[batchIndex];
        const embedding = embeddings[batchIndex];

        const { error: updateError } = await this.supabaseService.client
          .from('learning_document_chunks')
          .update({
            embedding: this.toVectorLiteral(embedding),
          })
          .eq('id', String(chunk.id));

        if (updateError) {
          throw new Error(
            `Failed to persist embedding for chunk ${String(chunk.id)}: ${updateError.message}`,
          );
        }
      }

      completed += batch.length;
      const progress = 60 + Math.round((completed / chunks.length) * 35);
      const remaining = Math.max(chunks.length - completed, 0);

      await this.updateLearning(context.learningId, {
        ingestion_status: 'embedding',
        ingestion_progress_pct: progress,
        ingestion_eta_seconds: Math.max(remaining * 2, 5),
      });
    }

    await this.logEvent(
      context.learningId,
      'embedded',
      `Generated embeddings for ${chunks.length} chunks`,
      { chunkCount: chunks.length },
    );

    return chunks.length;
  }

  async finalizeIngestion(
    context: IngestionContext,
    summary: DocumentAnalysisSummary,
  ): Promise<void> {
    await this.updateLearning(context.learningId, {
      ingestion_status: 'completed',
      ingestion_progress_pct: 100,
      ingestion_eta_seconds: 0,
      ingestion_error: null,
      ingestion_completed_at: new Date().toISOString(),
      document_page_count: summary.pageCount,
      document_image_count: summary.imageCount,
      stage: 'study_uploaded',
    });
    await this.logEvent(
      context.learningId,
      'completed',
      'Document ingestion completed successfully and is ready for study plan generation',
      summary,
    );
  }

  async failIngestion(
    context: IngestionContext,
    errorMessage: string,
  ): Promise<void> {
    await this.updateLearning(context.learningId, {
      ingestion_status: 'failed',
      ingestion_error: errorMessage,
      ingestion_eta_seconds: null,
      ingestion_progress_pct: 0,
    });
    await this.logEvent(context.learningId, 'failed', errorMessage);
  }

  private async clearExistingArtifacts(learningId: string): Promise<void> {
    await this.supabaseService.client
      .from('learning_chat_messages')
      .delete()
      .eq('learning_id', learningId);

    await this.supabaseService.client
      .from('learning_chat_threads')
      .delete()
      .eq('learning_id', learningId);

    await this.supabaseService.client
      .from('learning_plan_subtopics')
      .delete()
      .eq('learning_id', learningId);

    await this.supabaseService.client
      .from('learning_plan_topics')
      .delete()
      .eq('learning_id', learningId);

    await this.supabaseService.client
      .from('learning_plans')
      .delete()
      .eq('learning_id', learningId);

    await this.supabaseService.client
      .from('learning_document_chunks')
      .delete()
      .eq('learning_id', learningId);

    await this.supabaseService.client
      .from('learning_document_images')
      .delete()
      .eq('learning_id', learningId);

    await this.supabaseService.client
      .from('learning_ingestion_events')
      .delete()
      .eq('learning_id', learningId);
  }

  private async extractAndPersistImages(
    context: IngestionContext,
    result: DocumentAnalysisResult,
    operationLocation: string,
  ): Promise<PersistedImageRow[]> {
    const figures = result.figures ?? [];

    this.logger.log(
      `Document Intelligence returned ${figures.length} figures for learning ${context.learningId}`,
    );

    if (figures.length === 0) {
      return [];
    }

    const rows: Array<{
      learning_id: string;
      page_number: number | null;
      figure_id: string;
      blob_name: string;
      image_url: string;
      caption: string | null;
      metadata: Record<string, unknown>;
    }> = [];
    let downloadedCount = 0;
    let uploadedCount = 0;
    let missingCount = 0;

    for (const figure of figures) {
      if (!figure.id) {
        continue;
      }

      try {
        const figureBytes = await this.documentIntelligenceService.downloadFigure(
          operationLocation,
          figure.id,
        );

        if (!figureBytes) {
          missingCount += 1;
          continue;
        }

        downloadedCount += 1;

        const pageNumber = figure.boundingRegions?.[0]?.pageNumber ?? null;
        const upload = await this.azureService.uploadImage(
          context.userId,
          context.learningId,
          `figure-${figure.id}.png`,
          figureBytes,
          'image/png',
        );

        rows.push({
          learning_id: context.learningId,
          page_number: pageNumber,
          figure_id: figure.id,
          blob_name: upload.blobName,
          image_url: upload.sasUrl,
          caption: figure.caption?.content ?? null,
          metadata: {
            figureId: figure.id,
            pageNumber,
          },
        });
        uploadedCount += 1;
      } catch (error) {
        this.logger.warn(
          `Failed to extract figure ${figure.id} for learning ${context.learningId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (rows.length === 0) {
      this.logger.warn(
        `No figure images were persisted for learning ${context.learningId}. Downloaded=${downloadedCount}, missing=${missingCount}, uploaded=${uploadedCount}`,
      );
      return [];
    }

    this.logger.log(
      `Persisting ${rows.length} figure images for learning ${context.learningId}. Downloaded=${downloadedCount}, missing=${missingCount}, uploaded=${uploadedCount}`,
    );

    const { data, error } = await this.supabaseService.client
      .from('learning_document_images')
      .insert(rows)
      .select('id, page_number');

    if (error) {
      throw new Error(`Failed to persist extracted images: ${error.message}`);
    }

    return (data ?? []) as PersistedImageRow[];
  }

  private buildChunks(
    result: DocumentAnalysisResult,
    images: PersistedImageRow[],
  ): ChunkSeed[] {
    const paragraphsByPage = this.groupParagraphsByPage(result.paragraphs ?? []);
    const chunkSeeds: ChunkSeed[] = [];

    for (const [pageNumberText, paragraphs] of paragraphsByPage.entries()) {
      const pageNumber = Number(pageNumberText);
      const pageText = paragraphs
        .map((paragraph) => paragraph.content?.trim() ?? '')
        .filter(Boolean)
        .join('\n\n');

      if (!pageText) {
        continue;
      }

      const heading =
        paragraphs.find((paragraph) => paragraph.role === 'sectionHeading')
          ?.content ?? null;

      const imageIds = images
        .filter((image) => image.page_number === pageNumber)
        .map((image) => image.id);

      chunkSeeds.push(
        ...this.splitTextIntoChunks(pageText).map((chunkText) => ({
          pageNumber,
          sectionTitle: heading,
          chunkText: imageIds.length
            ? `${chunkText}\n\nRelevant image count on this page: ${imageIds.length}.`
            : chunkText,
        })),
      );
    }

    return chunkSeeds;
  }

  private groupParagraphsByPage(
    paragraphs: DocumentParagraph[],
  ): Map<number, DocumentParagraph[]> {
    const grouped = new Map<number, DocumentParagraph[]>();

    for (const paragraph of paragraphs) {
      const pageNumber = paragraph.boundingRegions?.[0]?.pageNumber;
      if (!pageNumber) {
        continue;
      }

      const existing = grouped.get(pageNumber) ?? [];
      existing.push(paragraph);
      grouped.set(pageNumber, existing);
    }

    return grouped;
  }

  private splitTextIntoChunks(text: string): string[] {
    const maxLength = 1800;
    const overlap = 250;
    const chunks: string[] = [];

    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + maxLength, text.length);
      chunks.push(text.slice(start, end).trim());
      if (end >= text.length) {
        break;
      }
      start = Math.max(end - overlap, 0);
    }

    return chunks.filter(Boolean);
  }

  private estimateEmbeddingEta(chunkCount: number): number {
    return Math.max(chunkCount * 3, 15);
  }

  private toVectorLiteral(embedding: number[]): string {
    return `[${embedding.join(',')}]`;
  }

  private async updateLearning(
    learningId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('learnings')
      .update(payload)
      .eq('id', learningId);

    if (error) {
      throw new Error(`Failed to update learning ${learningId}: ${error.message}`);
    }
  }

  private async logEvent(
    learningId: string,
    eventType: string,
    message: string,
    metadata?: unknown,
  ): Promise<void> {
    const safeMetadata =
      metadata && typeof metadata === 'object' ? metadata : {};

    const { error } = await this.supabaseService.client
      .from('learning_ingestion_events')
      .insert({
        learning_id: learningId,
        event_type: eventType,
        message,
        metadata: safeMetadata,
      });

    if (error) {
      throw new Error(
        `Failed to persist ingestion event for learning ${learningId}: ${error.message}`,
      );
    }
  }
}
