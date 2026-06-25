import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AzureService } from '../azure/azure.service';
import { IngestionService } from '../ingestion/ingestion.service';
import { CreateLearningDto } from './dto/create-learning.dto';
import { UpdateLearningDto } from './dto/update-learning.dto';
import { Learning } from '../types/learning';

@Injectable()
export class LearningsService {
  private readonly logger = new Logger(LearningsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly azureService: AzureService,
    private readonly ingestionService: IngestionService,
  ) {}

  // ── List ────────────────────────────────────────────────────────────────────

  async findAll(userId: string): Promise<Learning[]> {
    const { data, error } = await this.supabaseService.client
      .from('learnings')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new InternalServerErrorException(error.message);
    return data ?? [];
  }

  // ── Get one ─────────────────────────────────────────────────────────────────

  async findOne(id: string, userId: string): Promise<Learning> {
    const { data, error } = await this.supabaseService.client
      .from('learnings')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !data) throw new NotFoundException('Learning not found');
    return data;
  }

  // ── Create ──────────────────────────────────────────────────────────────────

  async create(userId: string, dto: CreateLearningDto): Promise<Learning> {
    const { data, error } = await this.supabaseService.client
      .from('learnings')
      .insert({
        user_id: userId,
        title: dto.title.trim(),
        description: dto.description?.trim() ?? null,
        stage: 'empty',
        ingestion_status: 'not_started',
      })
      .select()
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  // ── Update ──────────────────────────────────────────────────────────────────

  async update(
    id: string,
    userId: string,
    dto: UpdateLearningDto,
  ): Promise<Learning> {
    const payload: Record<string, unknown> = {};
    if (dto.title !== undefined) payload['title'] = dto.title.trim();
    if (dto.description !== undefined)
      payload['description'] = dto.description?.trim() ?? null;
    if (dto.stage !== undefined) payload['stage'] = dto.stage;

    if (Object.keys(payload).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    const { data, error } = await this.supabaseService.client
      .from('learnings')
      .update(payload)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !data) {
      throw new NotFoundException('Learning not found or update failed');
    }
    return data;
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async remove(id: string, userId: string): Promise<void> {
    // Fetch first to get blob name for Azure cleanup
    const { data: existing } = await this.supabaseService.client
      .from('learnings')
      .select('pdf_blob_name')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!existing) throw new NotFoundException('Learning not found');

    const { data: extractedImages } = await this.supabaseService.client
      .from('learning_document_images')
      .select('blob_name')
      .eq('learning_id', id);

    const { error } = await this.supabaseService.client
      .from('learnings')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw new InternalServerErrorException(error.message);

    // Clean up Azure blob (non-blocking)
    if (existing.pdf_blob_name) {
      this.azureService.deletePdf(existing.pdf_blob_name).catch((err) =>
        this.logger.warn(`Blob cleanup failed for ${existing.pdf_blob_name}`, err),
      );
    }

    for (const image of extractedImages ?? []) {
      const blobName = image.blob_name as string | undefined;
      if (!blobName) {
        continue;
      }

      this.azureService.deleteImage(blobName).catch((err) =>
        this.logger.warn(`Image blob cleanup failed for ${blobName}`, err),
      );
    }
  }

  // ── Upload PDF ──────────────────────────────────────────────────────────────

  async uploadPdf(
    id: string,
    userId: string,
    file: Express.Multer.File,
  ): Promise<Learning> {
    // Verify ownership
    const learning = await this.findOne(id, userId);

    // Mark as pending
    await this.supabaseService.client
      .from('learnings')
      .update({ stage: 'study_upload_pending' })
      .eq('id', id);

    let blobName: string;
    let sasUrl: string;

    try {
      ({ blobName, sasUrl } = await this.azureService.uploadPdf(
        userId,
        id,
        file.originalname,
        file.buffer,
        file.mimetype,
      ));
    } catch (err) {
      // Rollback stage
      await this.supabaseService.client
        .from('learnings')
        .update({ stage: learning.stage })
        .eq('id', id);
      throw err;
    }

    const { data, error } = await this.supabaseService.client
      .from('learnings')
      .update({
        stage: 'study_uploaded',
        pdf_url: sasUrl,
        pdf_blob_name: blobName,
        ingestion_status: 'uploaded',
        ingestion_progress_pct: 0,
        ingestion_error: null,
        ingestion_started_at: null,
        ingestion_completed_at: null,
        temporal_workflow_id: null,
        document_page_count: null,
        document_image_count: null,
        plan_status: 'not_started',
        plan_error: null,
        active_plan_id: null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new InternalServerErrorException(error.message);

    try {
      return await this.ingestionService.startForLearning(data as Learning);
    } catch (ingestionError) {
      const message =
        ingestionError instanceof Error
          ? ingestionError.message
          : 'Failed to start document ingestion';

      const { data: failedLearning, error: failedUpdateError } =
        await this.supabaseService.client
          .from('learnings')
          .update({
            ingestion_status: 'failed',
            ingestion_error: message,
            plan_status: 'failed',
            plan_error: message,
          })
          .eq('id', id)
          .select()
          .single();

      if (failedUpdateError || !failedLearning) {
        throw new InternalServerErrorException(message);
      }

      return failedLearning as Learning;
    }
  }

  async getStatus(id: string, userId: string): Promise<Learning> {
    return this.ingestionService.getLearningStatus(id, userId);
  }

  async restartIngestion(id: string, userId: string): Promise<Learning> {
    return this.ingestionService.restartIngestion(id, userId);
  }
}
