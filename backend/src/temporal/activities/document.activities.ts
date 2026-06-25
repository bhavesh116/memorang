import { Injectable, Logger } from '@nestjs/common';
import { AzureService } from '../../azure/azure.service';
import { AzureOpenAiService } from '../../azure-openai/azure-openai.service';
import {
  DocumentAnalysisResult,
  DocumentIntelligenceService,
  DocumentParagraph,
} from '../../document-intelligence/document-intelligence.service';
import { ImageClassificationService } from '../../image-classification/image-classification.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { DocumentAnalysisSummary, DocumentIntelligenceSnapshot } from '../types';

interface IngestionContext {
  learningId: string;
  userId: string;
  pdfBlobName: string;
  pdfUrl: string;
}

interface PersistedImageRow {
  id: string;
  page_number: number | null;
  is_instructional: boolean;
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
    private readonly imageClassificationService: ImageClassificationService,
  ) {}

  async initializeIngestion(context: IngestionContext): Promise<void> {
    await this.clearExistingArtifacts(context.learningId);
    await this.updateLearning(context.learningId, {
      ingestion_status: 'queued',
      ingestion_progress_pct: 5,
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

  async runDocumentIntelligence(
    context: IngestionContext,
  ): Promise<DocumentIntelligenceSnapshot> {
    await this.updateLearning(context.learningId, {
      ingestion_status: 'analyzing',
      ingestion_progress_pct: 15,
      ingestion_error: null,
    });
    await this.logEvent(context.learningId, 'analyzing', 'Document analysis started');

    const { operationLocation, result } =
      await this.documentIntelligenceService.analyzePdfFromUrl(
        context.pdfUrl,
        async ({ attempt, maxAttempts }) => {
          await this.updateAnalyzingProgress(
            context.learningId,
            attempt,
            maxAttempts,
          );
        },
      );

    const pageCount = result.pages?.length ?? 0;
    const figureCount = result.figures?.length ?? 0;
    const analysisBlobName = await this.azureService.uploadIngestionCache(
      context.userId,
      context.learningId,
      result,
    );

    await this.updateLearning(context.learningId, {
      ingestion_status: 'analyzing',
      ingestion_progress_pct: 55,
      document_page_count: pageCount,
    });

    return {
      operationLocation,
      analysisBlobName,
      pageCount,
      figureCount,
    };
  }

  async extractAndClassifyFigures(
    context: IngestionContext,
    snapshot: DocumentIntelligenceSnapshot,
  ): Promise<number> {
    const result = await this.azureService.downloadIngestionCache<DocumentAnalysisResult>(
      snapshot.analysisBlobName,
    );

    const images = await this.extractAndPersistImages(
      context,
      result,
      snapshot.operationLocation,
      async (ratio) => {
        const progress = 55 + Math.round(ratio * 4);

        await this.updateLearning(context.learningId, {
          ingestion_status: 'analyzing',
          ingestion_progress_pct: progress,
        });
      },
    );

    await this.updateLearning(context.learningId, {
      document_image_count: images.length,
    });

    return images.length;
  }

  async persistDocumentChunks(
    context: IngestionContext,
    snapshot: DocumentIntelligenceSnapshot,
  ): Promise<DocumentAnalysisSummary> {
    const result = await this.azureService.downloadIngestionCache<DocumentAnalysisResult>(
      snapshot.analysisBlobName,
    );
    const images = await this.loadPersistedImages(context.learningId);
    const chunks = this.buildChunks(result, images);

    if (chunks.length > 0) {
      const chunkRows = chunks.map((chunk, index) => ({
        learning_id: context.learningId,
        chunk_index: index,
        page_number: chunk.pageNumber,
        section_title: chunk.sectionTitle,
        chunk_text: chunk.chunkText,
        image_ids: images
          .filter(
            (image) =>
              image.page_number === chunk.pageNumber && image.is_instructional,
          )
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
      pageCount: snapshot.pageCount,
      imageCount: images.length,
      chunkCount: chunks.length,
    };

    await this.azureService.deleteIngestionCache(snapshot.analysisBlobName);

    await this.updateLearning(context.learningId, {
      ingestion_status: 'embedding',
      ingestion_progress_pct: 60,
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

  async analyzeDocument(context: IngestionContext): Promise<DocumentAnalysisSummary> {
    const snapshot = await this.runDocumentIntelligence(context);
    await this.extractAndClassifyFigures(context, snapshot);
    return this.persistDocumentChunks(context, snapshot);
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

      await Promise.all(
        batch.map(async (chunk, batchIndex) => {
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
        }),
      );

      completed += batch.length;
      const progress = 60 + Math.round((completed / chunks.length) * 35);

      await this.updateLearning(context.learningId, {
        ingestion_status: 'embedding',
        ingestion_progress_pct: progress,
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
    onProgress?: (ratio: number) => void | Promise<void>,
  ): Promise<PersistedImageRow[]> {
    const figures = result.figures ?? [];

    this.logger.log(
      `Document Intelligence returned ${figures.length} figures for learning ${context.learningId}`,
    );

    if (figures.length === 0) {
      return [];
    }

    const indexedFigures = figures
      .map((figure, figureIndex) => ({ figure, figureIndex }))
      .filter(({ figure }) => Boolean(figure.id));
    const concurrency = this.getFigureExtractionConcurrency();
    const extracted: Array<{
      figureIndex: number;
      row: {
        learning_id: string;
        page_number: number | null;
        figure_id: string;
        blob_name: string;
        image_url: string;
        caption: string | null;
        metadata: Record<string, unknown>;
      } | null;
      pendingClassification: {
        imageUrl: string;
        caption: string | null;
      } | null;
    }> = [];

    let downloadedCount = 0;
    let uploadedCount = 0;
    let missingCount = 0;
    let processedCount = 0;

    for (let batchStart = 0; batchStart < indexedFigures.length; batchStart += concurrency) {
      const batch = indexedFigures.slice(batchStart, batchStart + concurrency);
      const batchResults = await Promise.all(
        batch.map(async ({ figure, figureIndex }) => {
          try {
            const figureBytes = await this.documentIntelligenceService.downloadFigure(
              operationLocation,
              figure.id!,
            );

            if (!figureBytes) {
              missingCount += 1;
              return { figureIndex, row: null, pendingClassification: null };
            }

            downloadedCount += 1;

            const pageNumber = figure.boundingRegions?.[0]?.pageNumber ?? null;
            const caption = figure.caption?.content ?? null;
            const upload = await this.azureService.uploadImage(
              context.userId,
              context.learningId,
              `figure-${figure.id}.png`,
              figureBytes,
              'image/png',
            );

            const heuristic = this.imageClassificationService.classifyByHeuristic(caption);
            uploadedCount += 1;

            const row = {
              learning_id: context.learningId,
              page_number: pageNumber,
              figure_id: figure.id!,
              blob_name: upload.blobName,
              image_url: upload.sasUrl,
              caption,
              metadata: {
                figureId: figure.id,
                pageNumber,
                ...(heuristic
                  ? {
                      is_instructional: heuristic.isInstructional,
                      vision_description: heuristic.description,
                      classification_source: heuristic.source,
                    }
                  : {}),
              },
            };

            return {
              figureIndex,
              row,
              pendingClassification: heuristic
                ? null
                : {
                    imageUrl: upload.sasUrl,
                    caption,
                  },
            };
          } catch (error) {
            this.logger.warn(
              `Failed to extract figure ${figure.id} for learning ${context.learningId}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            return { figureIndex, row: null, pendingClassification: null };
          }
        }),
      );

      extracted.push(...batchResults);
      processedCount += batch.length;

      if (onProgress && indexedFigures.length > 0) {
        await onProgress(processedCount / indexedFigures.length);
      }
    }

    extracted.sort((left, right) => left.figureIndex - right.figureIndex);

    const rows: Array<{
      learning_id: string;
      page_number: number | null;
      figure_id: string;
      blob_name: string;
      image_url: string;
      caption: string | null;
      metadata: Record<string, unknown>;
    }> = [];
    const pendingClassifications: Array<{
      rowIndex: number;
      imageUrl: string;
      caption: string | null;
    }> = [];

    for (const item of extracted) {
      if (!item.row) {
        continue;
      }

      const rowIndex = rows.length;
      rows.push(item.row);

      if (item.pendingClassification) {
        pendingClassifications.push({
          rowIndex,
          imageUrl: item.pendingClassification.imageUrl,
          caption: item.pendingClassification.caption,
        });
      }
    }

    if (rows.length === 0) {
      this.logger.warn(
        `No figure images were persisted for learning ${context.learningId}. Downloaded=${downloadedCount}, missing=${missingCount}, uploaded=${uploadedCount}`,
      );
      return [];
    }

    if (pendingClassifications.length > 0) {
      this.logger.log(
        `Classifying ${pendingClassifications.length} figures with vision for learning ${context.learningId}`,
      );
      const classifications =
        await this.imageClassificationService.classifyImagesInBatches(
          pendingClassifications.map((item) => ({
            imageUrl: item.imageUrl,
            caption: item.caption,
          })),
        );

      pendingClassifications.forEach((item, index) => {
        const classification = classifications[index];
        rows[item.rowIndex].metadata = {
          ...rows[item.rowIndex].metadata,
          is_instructional: classification.isInstructional,
          vision_description: classification.description,
          classification_source: classification.source,
        };
      });
    }

    const instructionalCount = rows.filter(
      (row) => row.metadata.is_instructional === true,
    ).length;
    this.logger.log(
      `Persisting ${rows.length} figure images for learning ${context.learningId}. Instructional=${instructionalCount}, decorative=${rows.length - instructionalCount}`,
    );

    const { data, error } = await this.supabaseService.client
      .from('learning_document_images')
      .insert(rows)
      .select('id, page_number, metadata');

    if (error) {
      throw new Error(`Failed to persist extracted images: ${error.message}`);
    }

    return (data ?? []).map((row) => ({
      id: String(row.id),
      page_number: row.page_number as number | null,
      is_instructional: this.imageClassificationService.isInstructionalMetadata(
        row.metadata as Record<string, unknown>,
      ),
    })) as PersistedImageRow[];
  }

  private async loadPersistedImages(learningId: string): Promise<PersistedImageRow[]> {
    const { data, error } = await this.supabaseService.client
      .from('learning_document_images')
      .select('id, page_number, metadata')
      .eq('learning_id', learningId);

    if (error) {
      throw new Error(`Failed to load extracted images: ${error.message}`);
    }

    return (data ?? []).map((row) => ({
      id: String(row.id),
      page_number: row.page_number as number | null,
      is_instructional: this.imageClassificationService.isInstructionalMetadata(
        row.metadata as Record<string, unknown>,
      ),
    }));
  }

  private getFigureExtractionConcurrency(): number {
    const configured = Number(process.env.FIGURE_EXTRACTION_CONCURRENCY);
    return Number.isFinite(configured) && configured > 0 ? configured : 12;
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
        .filter((image) => image.page_number === pageNumber && image.is_instructional)
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

    const pagesWithChunks = new Set(chunkSeeds.map((chunk) => chunk.pageNumber));
    const instructionalImagesByPage = new Map<number, number>();

    for (const image of images) {
      if (!image.is_instructional || !image.page_number) {
        continue;
      }

      instructionalImagesByPage.set(
        image.page_number,
        (instructionalImagesByPage.get(image.page_number) ?? 0) + 1,
      );
    }

    for (const [pageNumber, imageCount] of instructionalImagesByPage) {
      if (pagesWithChunks.has(pageNumber)) {
        continue;
      }

      chunkSeeds.push({
        pageNumber,
        sectionTitle: null,
        chunkText: `This page contains ${imageCount} instructional figure(s) for visual identification, radiology interpretation, or diagram-based learning.`,
      });
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

  private async updateAnalyzingProgress(
    learningId: string,
    attempt: number,
    maxAttempts: number,
  ): Promise<void> {
    const progressStart = 15;
    const progressEnd = 55;
    const ratio = Math.min(attempt / maxAttempts, 0.98);
    const progress = Math.round(progressStart + ratio * (progressEnd - progressStart));

    await this.updateLearning(learningId, {
      ingestion_status: 'analyzing',
      ingestion_progress_pct: progress,
    });
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
