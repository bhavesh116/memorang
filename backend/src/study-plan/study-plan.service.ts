import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { SupabaseService } from '../supabase/supabase.service';
import { AzureOpenAiService } from '../azure-openai/azure-openai.service';
import { Learning } from '../types/learning';
import {
  LearningChatMessage,
  LearningChatThread,
  LearningPlan,
  LearningPlanSubtopic,
  LearningPlanTopic,
  StudyWorkspace,
} from './types';

const generatedStudyPlanSchema = z.object({
  title: z.string().min(3),
  summary: z.string().min(10),
  difficulty: z.string().min(2),
  rationale: z.string().min(10),
  topics: z
    .array(
      z.object({
        title: z.string().min(2),
        description: z.string().min(5),
        rationale: z.string().min(5),
        subtopics: z
          .array(
            z.object({
              title: z.string().min(2),
              description: z.string().min(5),
              rationale: z.string().min(5),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

const planEditSchema = z.object({
  topicSelections: z.array(
    z.object({
      topicTitle: z.string(),
      included: z.boolean(),
      reason: z.string().optional(),
    }),
  ),
  subtopicSelections: z.array(
    z.object({
      topicTitle: z.string(),
      subtopicTitle: z.string(),
      included: z.boolean(),
      reason: z.string().optional(),
    }),
  ),
});

type GeneratedStudyPlan = z.infer<typeof generatedStudyPlanSchema>;
type ExtractedPlanEdits = z.infer<typeof planEditSchema>;
type StudyPlanDifficulty = 'Easy' | 'Intermediate' | 'Hard';

@Injectable()
export class StudyPlanService {
  private readonly logger = new Logger(StudyPlanService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly azureOpenAiService: AzureOpenAiService,
  ) {}

  async generateStudyPlanForLearning(
    learningId: string,
    userId: string,
    preferredDifficulty: StudyPlanDifficulty = 'Intermediate',
  ): Promise<LearningPlan> {
    const learning = await this.getLearningOrThrow(learningId, userId);

    await this.updateLearningPlanState(learningId, {
      plan_status: 'generating',
      plan_error: null,
    });

    try {
      const planContext = await this.buildPlanContext(learningId);
      const model = this.azureOpenAiService
        .createChatModel({ temperature: 0.1 })
        .withStructuredOutput(generatedStudyPlanSchema);

      const generated = await model.invoke([
        new SystemMessage(
          [
            'You are generating a structured learning path for a PDF-backed study assistant.',
            'Return only the objectively best sequence of topics and subtopics needed to learn the material.',
            'Prefer clinically or conceptually meaningful topic grouping over chapter-order copying.',
            'The plan must help a user review and selectively include or omit topics before approval.',
            `Target difficulty: ${preferredDifficulty}. Tune the scope, pacing, and terminology to match it.`,
          ].join(' '),
        ),
        new HumanMessage(
          [
            `Learning title: ${learning.title}`,
            `Learning description: ${learning.description ?? 'No description provided.'}`,
            `Requested difficulty: ${preferredDifficulty}`,
            'Document context:',
            planContext,
          ].join('\n\n'),
        ),
      ]);

      const plan = await this.persistGeneratedPlan(
        learning,
        generated as GeneratedStudyPlan,
        preferredDifficulty,
      );

      await this.updateLearningPlanState(learningId, {
        plan_status: 'ready_for_review',
        active_plan_id: plan.id,
        plan_error: null,
      });

      return plan;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.updateLearningPlanState(learningId, {
        plan_status: 'failed',
        plan_error: message,
      });
      throw error;
    }
  }

  async getWorkspace(learningId: string, userId: string): Promise<StudyWorkspace> {
    await this.getLearningOrThrow(learningId, userId);

    const plan = await this.getLatestPlan(learningId, userId);
    const thread = await this.getOrCreateChatThread(learningId, userId, 'plan');
    const messages = await this.getChatMessages(thread.id, learningId, userId);

    return {
      plan,
      thread,
      messages,
    };
  }

  async updateTopicSelection(
    learningId: string,
    userId: string,
    topicId: string,
    included: boolean,
  ): Promise<LearningPlan> {
    await this.getLearningOrThrow(learningId, userId);

    const { data: topic, error } = await this.supabaseService.client
      .from('learning_plan_topics')
      .update({ included })
      .eq('id', topicId)
      .eq('learning_id', learningId)
      .eq('user_id', userId)
      .select('id')
      .single();

    if (error || !topic) {
      throw new NotFoundException('Topic not found');
    }

    await this.supabaseService.client
      .from('learning_plan_subtopics')
      .update({ included })
      .eq('learning_plan_topic_id', topicId)
      .eq('learning_id', learningId)
      .eq('user_id', userId);

    return this.getRequiredPlan(learningId, userId);
  }

  async updateSubtopicSelection(
    learningId: string,
    userId: string,
    subtopicId: string,
    included: boolean,
  ): Promise<LearningPlan> {
    await this.getLearningOrThrow(learningId, userId);

    const { data: subtopic, error } = await this.supabaseService.client
      .from('learning_plan_subtopics')
      .update({ included })
      .eq('id', subtopicId)
      .eq('learning_id', learningId)
      .eq('user_id', userId)
      .select('learning_plan_topic_id')
      .single();

    if (error || !subtopic) {
      throw new NotFoundException('Subtopic not found');
    }

    const topicId = String(subtopic.learning_plan_topic_id);
    const { data: siblings, error: siblingsError } =
      await this.supabaseService.client
        .from('learning_plan_subtopics')
        .select('included')
        .eq('learning_plan_topic_id', topicId)
        .eq('learning_id', learningId)
        .eq('user_id', userId);

    if (siblingsError) {
      throw new InternalServerErrorException(siblingsError.message);
    }

    const topicIncluded = (siblings ?? []).some((item) => Boolean(item.included));
    await this.supabaseService.client
      .from('learning_plan_topics')
      .update({ included: topicIncluded })
      .eq('id', topicId)
      .eq('learning_id', learningId)
      .eq('user_id', userId);

    return this.getRequiredPlan(learningId, userId);
  }

  async approvePlan(learningId: string, userId: string): Promise<LearningPlan> {
    const plan = await this.getRequiredPlan(learningId, userId);
    const approvedAt = new Date().toISOString();

    const { error: planError } = await this.supabaseService.client
      .from('learning_plans')
      .update({
        status: 'approved',
        approved_at: approvedAt,
      })
      .eq('id', plan.id)
      .eq('learning_id', learningId)
      .eq('user_id', userId);

    if (planError) {
      throw new InternalServerErrorException(planError.message);
    }

    await this.updateLearningPlanState(learningId, {
      plan_status: 'approved',
      stage: 'user_approved_study',
    });

    return this.getRequiredPlan(learningId, userId);
  }

  async getOrCreateChatThread(
    learningId: string,
    userId: string,
    threadType: 'plan' | 'lesson' = 'plan',
  ): Promise<LearningChatThread> {
    const langgraphThreadId = `learning:${learningId}:user:${userId}:thread:${threadType}`;
    const { data: existing, error: existingError } = await this.supabaseService.client
      .from('learning_chat_threads')
      .select('*')
      .eq('learning_id', learningId)
      .eq('user_id', userId)
      .eq('thread_type', threadType)
      .limit(1)
      .maybeSingle();

    if (existingError) {
      throw new InternalServerErrorException(existingError.message);
    }

    if (existing) {
      return existing as LearningChatThread;
    }

    const { data, error } = await this.supabaseService.client
      .from('learning_chat_threads')
      .insert({
        learning_id: learningId,
        user_id: userId,
        langgraph_thread_id: langgraphThreadId,
        thread_type: threadType,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message || 'Failed to create chat thread',
      );
    }

    return data as LearningChatThread;
  }

  async getChatMessages(
    threadId: string,
    learningId: string,
    userId: string,
  ): Promise<LearningChatMessage[]> {
    const { data, error } = await this.supabaseService.client
      .from('learning_chat_messages')
      .select('*')
      .eq('learning_chat_thread_id', threadId)
      .eq('learning_id', learningId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []) as LearningChatMessage[];
  }

  async createUserMessage(
    learningId: string,
    userId: string,
    content: string,
    threadType: 'plan' | 'lesson' = 'plan',
  ): Promise<LearningChatMessage> {
    const thread = await this.getOrCreateChatThread(learningId, userId, threadType);
    return this.insertChatMessage({
      threadId: thread.id,
      learningId,
      userId,
      role: 'user',
      content,
    });
  }

  async createAssistantMessage(params: {
    learningId: string;
    userId: string;
    content: string;
    metadata?: Record<string, unknown>;
    threadType?: 'plan' | 'lesson';
  }): Promise<LearningChatMessage> {
    const thread = await this.getOrCreateChatThread(
      params.learningId,
      params.userId,
      params.threadType ?? 'plan',
    );
    return this.insertChatMessage({
      threadId: thread.id,
      learningId: params.learningId,
      userId: params.userId,
      role: 'assistant',
      content: params.content,
      metadata: params.metadata,
    });
  }

  async applyChatRequestedPlanChanges(
    learningId: string,
    userId: string,
    message: string,
  ): Promise<{ plan: LearningPlan | null; changes: string[] }> {
    const plan = await this.getLatestPlan(learningId, userId);
    if (!plan) {
      return { plan: null, changes: [] };
    }

    const formattedPlan = this.formatPlanForPrompt(plan);
    const model = this.azureOpenAiService
      .createChatModel({ temperature: 0 })
      .withStructuredOutput(planEditSchema);

    const extracted = (await model.invoke([
      new SystemMessage(
        [
          'You extract plan selection changes from a user message.',
          'Only produce changes when the user clearly wants to include, skip, omit, focus on, or exclude a topic or subtopic.',
          'Use the exact topic and subtopic titles from the provided plan.',
          'Return empty arrays if there is no explicit selection change request.',
        ].join(' '),
      ),
      new HumanMessage(
        [
          'Current plan:',
          formattedPlan,
          '',
          `User message: ${message}`,
        ].join('\n'),
      ),
    ])) as ExtractedPlanEdits;

    const appliedChanges: string[] = [];

    for (const topicSelection of extracted.topicSelections) {
      const topic = plan.topics?.find(
        (item) => item.title.toLowerCase() === topicSelection.topicTitle.toLowerCase(),
      );
      if (!topic) {
        continue;
      }
      await this.updateTopicSelection(
        learningId,
        userId,
        topic.id,
        topicSelection.included,
      );
      appliedChanges.push(
        `${topicSelection.included ? 'Included' : 'Excluded'} topic "${topic.title}"`,
      );
    }

    const updatedPlan = await this.getRequiredPlan(learningId, userId);

    for (const subtopicSelection of extracted.subtopicSelections) {
      const topic = updatedPlan.topics?.find(
        (item) => item.title.toLowerCase() === subtopicSelection.topicTitle.toLowerCase(),
      );
      const subtopic = topic?.subtopics?.find(
        (item) =>
          item.title.toLowerCase() === subtopicSelection.subtopicTitle.toLowerCase(),
      );
      if (!subtopic) {
        continue;
      }
      await this.updateSubtopicSelection(
        learningId,
        userId,
        subtopic.id,
        subtopicSelection.included,
      );
      appliedChanges.push(
        `${subtopicSelection.included ? 'Included' : 'Excluded'} subtopic "${subtopic.title}"`,
      );
    }

    return {
      plan: await this.getRequiredPlan(learningId, userId),
      changes: appliedChanges,
    };
  }

  async buildChatSystemPrompt(
    learningId: string,
    userId: string,
    userMessage: string,
    appliedChanges: string[],
  ): Promise<string> {
    const learning = await this.getLearningOrThrow(learningId, userId);
    const plan = await this.getRequiredPlan(learningId, userId);
    const context = await this.getRelevantContext(learningId, userMessage);

    const approvedInstruction =
      learning.plan_status === 'approved'
        ? 'The plan has been approved. Help the learner stay oriented, but do not modify approved selections.'
        : 'The plan is awaiting user approval. Help the learner refine topic choices, but do not move on to lesson delivery and remind them to use the Approve button when ready.';

    return [
      'You are Memorang’s study-planning assistant.',
      approvedInstruction,
      'Keep replies concise, collaborative, and specific to the current study plan.',
      'When the user asks to focus on, include, or skip a topic, acknowledge the change if it has already been applied.',
      'Never claim that lesson execution has started. Stay in the planning phase until approval.',
      '',
      `Learning: ${learning.title}`,
      `Description: ${learning.description ?? 'No description provided.'}`,
      `Plan difficulty: ${plan.difficulty ?? 'Not specified'}`,
      `Plan summary: ${plan.summary ?? ''}`,
      appliedChanges.length
        ? `Applied changes this turn: ${appliedChanges.join('; ')}`
        : 'Applied changes this turn: none',
      '',
      'Current selected plan:',
      this.formatPlanForPrompt(plan),
      '',
      'Relevant document context:',
      context || 'No focused context found; rely on the plan.',
    ].join('\n');
  }

  private async getRelevantContext(
    learningId: string,
    query: string,
  ): Promise<string> {
    const embedding = await this.azureOpenAiService.embedQuery(query);
    const { data, error } = await this.supabaseService.client.rpc(
      'match_learning_document_chunks',
      {
        query_embedding: `[${embedding.join(',')}]`,
        target_learning_id: learningId,
        match_count: 6,
      },
    );

    if (error) {
      this.logger.warn(`Failed to retrieve relevant chunks: ${error.message}`);
      return '';
    }

    const chunks = (data ?? []) as Array<{
      page_number?: number | null;
      section_title?: string | null;
      chunk_text: string;
    }>;

    return chunks
      .map((chunk) =>
        [
          `Page ${chunk.page_number ?? '?'}`,
          chunk.section_title ? `Section: ${chunk.section_title}` : null,
          chunk.chunk_text,
        ]
          .filter(Boolean)
          .join(' — '),
      )
      .join('\n\n')
      .slice(0, 12000);
  }

  private async buildPlanContext(learningId: string): Promise<string> {
    const { data: chunks, error } = await this.supabaseService.client
      .from('learning_document_chunks')
      .select('page_number, section_title, chunk_text')
      .eq('learning_id', learningId)
      .order('chunk_index', { ascending: true })
      .limit(40);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const { data: images } = await this.supabaseService.client
      .from('learning_document_images')
      .select('page_number, caption')
      .eq('learning_id', learningId)
      .order('page_number', { ascending: true })
      .limit(20);

    const chunkContext = (chunks ?? [])
      .map((chunk) =>
        [
          `Page ${chunk.page_number ?? '?'}`,
          chunk.section_title ? `Section: ${chunk.section_title}` : null,
          chunk.chunk_text,
        ]
          .filter(Boolean)
          .join(' — '),
      )
      .join('\n\n');

    const imageContext = (images ?? [])
      .map(
        (image) =>
          `Visual on page ${image.page_number ?? '?'}: ${image.caption ?? 'No caption available'}`,
      )
      .join('\n');

    return [chunkContext, imageContext].filter(Boolean).join('\n\n').slice(0, 24000);
  }

  private async persistGeneratedPlan(
    learning: Learning,
    generated: GeneratedStudyPlan,
    preferredDifficulty: StudyPlanDifficulty,
  ): Promise<LearningPlan> {
    const currentPlan = await this.getLatestPlan(learning.id, learning.user_id);
    const nextVersion = (currentPlan?.version ?? 0) + 1;

    await this.supabaseService.client
      .from('learning_plans')
      .update({ status: 'archived' })
      .eq('learning_id', learning.id)
      .eq('user_id', learning.user_id)
      .neq('status', 'approved');

    const { data: plan, error: planError } = await this.supabaseService.client
      .from('learning_plans')
      .insert({
        learning_id: learning.id,
        user_id: learning.user_id,
        version: nextVersion,
        status: 'ready_for_review',
        title: generated.title,
        summary: generated.summary,
        difficulty: preferredDifficulty,
        rationale: generated.rationale,
      })
      .select('*')
      .single();

    if (planError || !plan) {
      throw new InternalServerErrorException(
        planError?.message || 'Failed to create learning plan',
      );
    }

    const topicRows = generated.topics.map((topic, index) => ({
      learning_plan_id: plan.id,
      learning_id: learning.id,
      user_id: learning.user_id,
      title: topic.title,
      description: topic.description,
      rationale: topic.rationale,
      order_index: index,
      included: true,
    }));

    const { data: insertedTopics, error: topicError } = await this.supabaseService.client
      .from('learning_plan_topics')
      .insert(topicRows)
      .select('*');

    if (topicError || !insertedTopics) {
      throw new InternalServerErrorException(
        topicError?.message || 'Failed to create learning plan topics',
      );
    }

    const subtopicRows = insertedTopics.flatMap((topicRow, topicIndex) =>
      generated.topics[topicIndex].subtopics.map((subtopic, subtopicIndex) => ({
        learning_plan_id: plan.id,
        learning_plan_topic_id: topicRow.id,
        learning_id: learning.id,
        user_id: learning.user_id,
        title: subtopic.title,
        description: subtopic.description,
        rationale: subtopic.rationale,
        order_index: subtopicIndex,
        included: true,
      })),
    );

    if (subtopicRows.length > 0) {
      const { error: subtopicError } = await this.supabaseService.client
        .from('learning_plan_subtopics')
        .insert(subtopicRows);

      if (subtopicError) {
        throw new InternalServerErrorException(subtopicError.message);
      }
    }

    return this.getRequiredPlan(learning.id, learning.user_id);
  }

  private async getLatestPlan(
    learningId: string,
    userId: string,
  ): Promise<LearningPlan | null> {
    const { data: plan, error } = await this.supabaseService.client
      .from('learning_plans')
      .select('*')
      .eq('learning_id', learningId)
      .eq('user_id', userId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!plan) {
      return null;
    }

    const { data: topics, error: topicsError } = await this.supabaseService.client
      .from('learning_plan_topics')
      .select('*')
      .eq('learning_plan_id', plan.id)
      .eq('learning_id', learningId)
      .eq('user_id', userId)
      .order('order_index', { ascending: true });

    if (topicsError) {
      throw new InternalServerErrorException(topicsError.message);
    }

    const topicIds = (topics ?? []).map((topic) => topic.id);
    const { data: subtopics, error: subtopicsError } = await this.supabaseService.client
      .from('learning_plan_subtopics')
      .select('*')
      .eq('learning_plan_id', plan.id)
      .eq('learning_id', learningId)
      .eq('user_id', userId)
      .in('learning_plan_topic_id', topicIds.length > 0 ? topicIds : ['00000000-0000-0000-0000-000000000000'])
      .order('order_index', { ascending: true });

    if (subtopicsError) {
      throw new InternalServerErrorException(subtopicsError.message);
    }

    const subtopicsByTopic = new Map<string, LearningPlanSubtopic[]>();
    for (const subtopic of (subtopics ?? []) as LearningPlanSubtopic[]) {
      const existing = subtopicsByTopic.get(subtopic.learning_plan_topic_id) ?? [];
      existing.push(subtopic);
      subtopicsByTopic.set(subtopic.learning_plan_topic_id, existing);
    }

    return {
      ...(plan as LearningPlan),
      topics: (topics ?? []).map((topic) => ({
        ...(topic as LearningPlanTopic),
        subtopics: subtopicsByTopic.get(topic.id) ?? [],
      })),
    };
  }

  async getLatestPlanForLearning(
    learningId: string,
    userId: string,
  ): Promise<LearningPlan | null> {
    return this.getLatestPlan(learningId, userId);
  }

  async getLatestApprovedPlanForLearning(
    learningId: string,
    userId: string,
  ): Promise<LearningPlan | null> {
    return this.getLatestApprovedPlan(learningId, userId);
  }

  async getRequiredApprovedPlanForLearning(
    learningId: string,
    userId: string,
  ): Promise<LearningPlan> {
    const plan = await this.getLatestApprovedPlan(learningId, userId);
    if (!plan) {
      throw new NotFoundException('Approved study plan not found');
    }
    return plan;
  }

  async getRequiredPlanForLearning(
    learningId: string,
    userId: string,
  ): Promise<LearningPlan> {
    return this.getRequiredPlan(learningId, userId);
  }

  async getLearningForUser(
    learningId: string,
    userId: string,
  ): Promise<Learning> {
    return this.getLearningOrThrow(learningId, userId);
  }

  private async getRequiredPlan(
    learningId: string,
    userId: string,
  ): Promise<LearningPlan> {
    const plan = await this.getLatestPlan(learningId, userId);
    if (!plan) {
      throw new NotFoundException('Study plan not found');
    }
    return plan;
  }

  private async getLatestApprovedPlan(
    learningId: string,
    userId: string,
  ): Promise<LearningPlan | null> {
    const { data: plan, error } = await this.supabaseService.client
      .from('learning_plans')
      .select('*')
      .eq('learning_id', learningId)
      .eq('user_id', userId)
      .eq('status', 'approved')
      .order('approved_at', { ascending: false })
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!plan) {
      return null;
    }

    const { data: topics, error: topicsError } = await this.supabaseService.client
      .from('learning_plan_topics')
      .select('*')
      .eq('learning_plan_id', plan.id)
      .eq('learning_id', learningId)
      .eq('user_id', userId)
      .order('order_index', { ascending: true });

    if (topicsError) {
      throw new InternalServerErrorException(topicsError.message);
    }

    const topicIds = (topics ?? []).map((topic) => topic.id);
    const { data: subtopics, error: subtopicsError } =
      await this.supabaseService.client
        .from('learning_plan_subtopics')
        .select('*')
        .eq('learning_plan_id', plan.id)
        .eq('learning_id', learningId)
        .eq('user_id', userId)
        .in(
          'learning_plan_topic_id',
          topicIds.length > 0
            ? topicIds
            : ['00000000-0000-0000-0000-000000000000'],
        )
        .order('order_index', { ascending: true });

    if (subtopicsError) {
      throw new InternalServerErrorException(subtopicsError.message);
    }

    const subtopicsByTopic = new Map<string, LearningPlanSubtopic[]>();
    for (const subtopic of (subtopics ?? []) as LearningPlanSubtopic[]) {
      const existing = subtopicsByTopic.get(subtopic.learning_plan_topic_id) ?? [];
      existing.push(subtopic);
      subtopicsByTopic.set(subtopic.learning_plan_topic_id, existing);
    }

    return {
      ...(plan as LearningPlan),
      topics: (topics ?? []).map((topic) => ({
        ...(topic as LearningPlanTopic),
        subtopics: subtopicsByTopic.get(topic.id) ?? [],
      })),
    };
  }

  private formatPlanForPrompt(plan: LearningPlan): string {
    return (plan.topics ?? [])
      .map((topic) => {
        const subtopics = (topic.subtopics ?? [])
          .map(
            (subtopic) =>
              `  - ${subtopic.title} [${subtopic.included ? 'included' : 'excluded'}]`,
          )
          .join('\n');
        return `- ${topic.title} [${topic.included ? 'included' : 'excluded'}]\n${subtopics}`;
      })
      .join('\n');
  }

  private async getLearningOrThrow(
    learningId: string,
    userId: string,
  ): Promise<Learning> {
    const { data, error } = await this.supabaseService.client
      .from('learnings')
      .select('*')
      .eq('id', learningId)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Learning not found');
    }

    return data as Learning;
  }

  private async updateLearningPlanState(
    learningId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('learnings')
      .update(payload)
      .eq('id', learningId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  private async insertChatMessage(params: {
    threadId: string;
    learningId: string;
    userId: string;
    role: 'system' | 'user' | 'assistant';
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<LearningChatMessage> {
    const { data, error } = await this.supabaseService.client
      .from('learning_chat_messages')
      .insert({
        learning_chat_thread_id: params.threadId,
        learning_id: params.learningId,
        user_id: params.userId,
        role: params.role,
        content: params.content,
        metadata: params.metadata ?? {},
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message || 'Failed to save chat message',
      );
    }

    return data as LearningChatMessage;
  }
}
