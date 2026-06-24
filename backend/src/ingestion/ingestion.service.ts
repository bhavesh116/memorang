import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { Learning } from '../types/learning';
import { TemporalService } from '../temporal/temporal.service';

@Injectable()
export class IngestionService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly temporalService: TemporalService,
  ) {}

  async startForLearning(learning: Learning): Promise<Learning> {
    if (!learning.pdf_blob_name || !learning.pdf_url) {
      throw new InternalServerErrorException(
        'PDF metadata missing, cannot start ingestion',
      );
    }

    const workflowId = await this.temporalService.startDocumentIngestionWorkflow({
      learningId: learning.id,
      userId: learning.user_id,
      pdfBlobName: learning.pdf_blob_name,
      pdfUrl: learning.pdf_url,
    });

    const { data, error } = await this.supabaseService.client
      .from('learnings')
      .update({
        temporal_workflow_id: workflowId,
      })
      .eq('id', learning.id)
      .select()
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message || 'Failed to persist workflow metadata',
      );
    }

    return data as Learning;
  }

  async getLearningStatus(id: string, userId: string): Promise<Learning> {
    const { data, error } = await this.supabaseService.client
      .from('learnings')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Learning not found');
    }

    return data as Learning;
  }

  async restartIngestion(id: string, userId: string): Promise<Learning> {
    const learning = await this.getLearningStatus(id, userId);

    if (!learning.pdf_blob_name || !learning.pdf_url) {
      throw new InternalServerErrorException(
        'Upload a PDF before restarting ingestion',
      );
    }

    const { data, error } = await this.supabaseService.client
      .from('learnings')
      .update({
        ingestion_status: 'uploaded',
        ingestion_progress_pct: 0,
        ingestion_eta_seconds: null,
        ingestion_error: null,
        ingestion_started_at: null,
        ingestion_completed_at: null,
        document_page_count: null,
        document_image_count: null,
        plan_status: 'not_started',
        plan_error: null,
        active_plan_id: null,
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message || 'Failed to reset ingestion status',
      );
    }

    return this.startForLearning(data as Learning);
  }
}
