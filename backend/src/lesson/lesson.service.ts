import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { AzureOpenAiService } from '../azure-openai/azure-openai.service';
import { LangGraphService } from '../langgraph/langgraph.service';
import { StudyPlanService } from '../study-plan/study-plan.service';
import { LearningChatMessage, LearningChatThread } from '../study-plan/types';
import { SupabaseService } from '../supabase/supabase.service';
import { Learning } from '../types/learning';
import {
  LessonFrictionZone,
  LearningLesson,
  LearningLessonQuestion,
  LessonObjectiveMetric,
  LessonSummary,
  LessonWorkspace,
} from './types';

const lessonQuestionSchema = z.object({
  title: z.string().min(3),
  summary: z.string().min(10),
  questions: z
    .array(
      z.object({
        objectiveTitle: z.string().min(2),
        questionType: z.enum(['text', 'image']),
        prompt: z.string().min(10),
        questionImageId: z.string().optional().nullable(),
        choices: z.array(z.string().min(1)).length(4),
        correctChoiceIndex: z.number().int().min(0).max(3),
        weightage: z.number().int().min(1).max(10),
        hintText: z.string().min(5),
        explanationText: z.string().min(10),
        explanationImageId: z.string().optional().nullable(),
      }),
    )
    .min(4),
});

type GeneratedLesson = z.infer<typeof lessonQuestionSchema>;

@Injectable()
export class LessonService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly azureOpenAiService: AzureOpenAiService,
    private readonly studyPlanService: StudyPlanService,
    private readonly langGraphService: LangGraphService,
  ) {}

  async getWorkspace(learningId: string, userId: string): Promise<LessonWorkspace> {
    const learning = await this.studyPlanService.getLearningForUser(learningId, userId);
    const plan = await this.studyPlanService.getLatestPlanForLearning(learningId, userId);
    const lesson = await this.getLatestLesson(learningId, userId);
    const questions = lesson
      ? await this.getLessonQuestions(lesson.id, learningId, userId)
      : [];
    const thread =
      learning.stage === 'user_approved_study' ||
      learning.stage === 'lesson_in_progress' ||
      learning.stage === 'lesson_complete'
        ? await this.studyPlanService.getOrCreateChatThread(
            learningId,
            userId,
            'lesson',
          )
        : null;
    const messages = thread
      ? await this.studyPlanService.getChatMessages(thread.id, learningId, userId)
      : [];
    const summary =
      lesson && lesson.status === 'completed'
        ? await this.buildLessonSummary(lesson, questions)
        : null;

    return {
      plan,
      lesson,
      questions,
      thread,
      messages,
      summary,
    };
  }

  async startLesson(
    learningId: string,
    userId: string,
    regenerate = false,
  ): Promise<LessonWorkspace> {
    const learning = await this.studyPlanService.getLearningForUser(learningId, userId);

    if (!regenerate && (learning.plan_status !== 'approved' || learning.stage !== 'user_approved_study')) {
      throw new BadRequestException(
        'Approve the study plan before starting the lesson.',
      );
    }

    const plan = regenerate
      ? await this.studyPlanService.getRequiredApprovedPlanForLearning(
          learningId,
          userId,
        )
      : await this.studyPlanService.getRequiredPlanForLearning(learningId, userId);

    if (!regenerate) {
      const existingLesson = await this.getLatestLesson(learningId, userId);
      if (existingLesson && existingLesson.status !== 'archived') {
        return this.getWorkspace(learningId, userId);
      }
    }

    if (regenerate) {
      await this.deleteLessonArtifacts(learningId, userId);
    }

    const promptContext = await this.buildLessonContext(learningId, plan);
    const targetCount = this.determineQuestionCount(plan);
    const model = this.azureOpenAiService
      .createChatModel({ temperature: 0.2 })
      .withStructuredOutput(lessonQuestionSchema);

    const generated = (await model.invoke([
      new SystemMessage(
        [
          'You are generating a mastery-oriented MCQ lesson.',
          'Cover the selected objectives well enough that the learner can understand the core topics.',
          'Use image-based questions when an image candidate is provided and it is genuinely helpful.',
          'Generate plausible distractors.',
          'Assign a weightage from 1 to 10 for each question based on importance and diagnostic value.',
          'Hints must support reasoning without revealing the answer directly.',
          'Explanations should teach the concept and mention why the correct option is right.',
        ].join(' '),
      ),
      new HumanMessage(
        [
          `Target question count: ${targetCount}`,
          `Target difficulty: ${plan.difficulty ?? 'Intermediate'}`,
          'Approved study plan:',
          this.formatApprovedObjectives(plan),
          '',
          'Generate the full quiz set now for the approved study plan. Do not assume later questions will be generated dynamically.',
          '',
          'Available learning context and image candidates:',
          promptContext,
        ].join('\n'),
      ),
    ])) as GeneratedLesson;

    const lesson = await this.persistLesson(learning, plan, generated);

    await this.supabaseService.client
      .from('learnings')
      .update({
        stage: 'lesson_in_progress',
      })
      .eq('id', learningId)
      .eq('user_id', userId);

    return this.getWorkspace(learningId, userId);
  }

  async answerQuestion(params: {
    learningId: string;
    userId: string;
    lessonId: string;
    questionId: string;
    selectedChoiceIndex: number;
    responseTimeMs?: number | null;
  }) {
    const question = await this.getQuestion(params.questionId, params.learningId, params.userId);
    const lesson = await this.getLessonById(
      params.lessonId,
      params.learningId,
      params.userId,
    );

    const isCorrect = params.selectedChoiceIndex === question.correct_choice_index;

    const { error: attemptError } = await this.supabaseService.client
      .from('learning_lesson_attempts')
      .insert({
        learning_lesson_id: lesson.id,
        learning_lesson_question_id: question.id,
        learning_id: params.learningId,
        user_id: params.userId,
        selected_choice_index: params.selectedChoiceIndex,
        is_correct: isCorrect,
        response_time_ms: params.responseTimeMs ?? null,
      });

    if (attemptError) {
      throw new InternalServerErrorException(attemptError.message);
    }

    if (isCorrect && !question.answered_correctly) {
      await this.supabaseService.client
        .from('learning_lesson_questions')
        .update({ answered_correctly: true })
        .eq('id', question.id)
        .eq('learning_id', params.learningId)
        .eq('user_id', params.userId);
    }

    const refreshedQuestions = await this.getLessonQuestions(
      lesson.id,
      params.learningId,
      params.userId,
    );
    const correctAnswers = refreshedQuestions.filter((item) => item.answered_correctly).length;
    const nextQuestionIndex = refreshedQuestions.findIndex(
      (item) => !item.answered_correctly,
    );
    const completed = nextQuestionIndex === -1;

    await this.supabaseService.client
      .from('learning_lessons')
      .update({
        correct_answers: correctAnswers,
        current_question_index: completed ? refreshedQuestions.length : nextQuestionIndex,
        status: completed ? 'completed' : 'in_progress',
        completed_at: completed ? new Date().toISOString() : null,
      })
      .eq('id', lesson.id)
      .eq('learning_id', params.learningId)
      .eq('user_id', params.userId);

    if (completed) {
      await this.supabaseService.client
        .from('learnings')
        .update({ stage: 'lesson_complete' })
        .eq('id', params.learningId)
        .eq('user_id', params.userId);
    }

    return {
      correct: isCorrect,
      hint: isCorrect ? null : question.hint_text,
      explanation: isCorrect ? question.explanation_text : null,
      explanationImageUrl: isCorrect ? question.explanation_image_url ?? null : null,
      lesson: await this.getWorkspace(params.learningId, params.userId),
      selectedChoiceIndex: params.selectedChoiceIndex,
      completed,
    };
  }

  async getQuestionHint(params: {
    learningId: string;
    userId: string;
    lessonId: string;
    questionId: string;
  }) {
    await this.getLessonById(params.lessonId, params.learningId, params.userId);
    const question = await this.getQuestion(
      params.questionId,
      params.learningId,
      params.userId,
    );
    const nextHintCount = (question.hint_requests ?? 0) + 1;

    const { error } = await this.supabaseService.client
      .from('learning_lesson_questions')
      .update({ hint_requests: nextHintCount })
      .eq('id', question.id)
      .eq('learning_id', params.learningId)
      .eq('user_id', params.userId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return {
      hint: question.hint_text,
      hintCount: nextHintCount,
    };
  }

  async streamLessonCoach(params: {
    learningId: string;
    userId: string;
    message: string;
  }) {
    const workspace = await this.getWorkspace(params.learningId, params.userId);
    const thread = await this.studyPlanService.getOrCreateChatThread(
      params.learningId,
      params.userId,
      'lesson',
    );
    const currentQuestion = this.getCurrentQuestion(
      workspace.lesson,
      workspace.questions,
    );

    const userMessage = await this.studyPlanService.createUserMessage(
      params.learningId,
      params.userId,
      params.message,
      'lesson',
    );

    const systemPrompt = await this.buildLessonCoachPrompt(
      params.learningId,
      params.userId,
      currentQuestion,
    );

    const eventStream = await this.langGraphService.streamConversation({
      threadId: thread.langgraph_thread_id,
      learningId: params.learningId,
      systemPrompt,
      message: params.message,
    });

    return {
      userMessage,
      thread,
      eventStream,
    };
  }

  async saveLessonCoachAssistantMessage(params: {
    learningId: string;
    userId: string;
    content: string;
  }): Promise<LearningChatMessage> {
    return this.studyPlanService.createAssistantMessage({
      learningId: params.learningId,
      userId: params.userId,
      content: params.content,
      threadType: 'lesson',
    });
  }

  private async buildLessonCoachPrompt(
    learningId: string,
    userId: string,
    currentQuestion: LearningLessonQuestion | null,
  ): Promise<string> {
    const plan = await this.studyPlanService.getRequiredPlanForLearning(
      learningId,
      userId,
    );
    const currentObjective = currentQuestion?.objective_title ?? 'Current objective';

    const context = await this.getRelevantContext(learningId, currentObjective);

    return [
      'You are Memorang’s lesson coach during the quiz loop.',
      'Never reveal the correct answer directly.',
      'You may provide hints, clarify concepts, and teach supporting context.',
      'Always steer the learner back toward answering the current question.',
      'If the user asks for the answer, refuse gently and give a hint instead.',
      '',
      `Current objective: ${currentObjective}`,
      currentQuestion
        ? `Current question: ${currentQuestion.prompt}`
        : 'There is no active question yet.',
      '',
      'Approved objectives:',
      this.formatApprovedObjectives(plan),
      '',
      'Relevant document context:',
      context || 'No extra context found.',
    ].join('\n');
  }

  private async buildLessonContext(learningId: string, plan: any): Promise<string> {
    const sections: string[] = [];
    const imageMap = new Map<string, string>();

    for (const topic of plan.topics ?? []) {
      if (!topic.included) continue;
      const objectiveQuery = [topic.title, ...(topic.subtopics ?? []).filter((sub: any) => sub.included).map((sub: any) => sub.title)].join(', ');
      const relevantChunks = await this.getRelevantChunkRows(learningId, objectiveQuery, 5);
      const imageIds = new Set<string>();
      const chunkLines = relevantChunks
        .map((chunk) => {
          const ids = Array.isArray(chunk.image_ids) ? chunk.image_ids : [];
          ids.forEach((id) => imageIds.add(String(id)));
          return [
            `Page ${chunk.page_number ?? '?'}`,
            chunk.section_title ? `Section: ${chunk.section_title}` : null,
            chunk.chunk_text,
          ]
            .filter(Boolean)
            .join(' — ');
        })
        .join('\n');

      const imageCandidates = await this.getImageCandidates(
        learningId,
        Array.from(imageIds),
      );
      imageCandidates.forEach((image) => {
        imageMap.set(
          image.id,
          `Image ${image.id} (page ${image.page_number ?? '?'}): ${image.caption ?? 'No caption'} — ${image.image_url}`,
        );
      });

      sections.push(
        [
          `Objective: ${topic.title}`,
          chunkLines,
          imageCandidates.length
            ? `Image candidates:\n${imageCandidates
                .map(
                  (image) =>
                    `- ${image.id}: ${image.caption ?? 'No caption'} (page ${image.page_number ?? '?'})`,
                )
                .join('\n')}`
            : 'Image candidates: none',
        ].join('\n'),
      );
    }

    if (imageMap.size > 0) {
      sections.push(
        `Image reference map:\n${Array.from(imageMap.values())
          .slice(0, 20)
          .map((line) => `- ${line}`)
          .join('\n')}`,
      );
    }

    return sections.join('\n\n').slice(0, 26000);
  }

  private determineQuestionCount(plan: any): number {
    const includedTopics = (plan.topics ?? []).filter((topic: any) => topic.included);
    const includedSubtopics = includedTopics.flatMap((topic: any) =>
      (topic.subtopics ?? []).filter((subtopic: any) => subtopic.included),
    );

    const desired = Math.max(
      6,
      includedSubtopics.length > 0
        ? Math.min(includedSubtopics.length, 12)
        : includedTopics.length * 2,
    );

    return Math.min(Math.max(desired, 6), 12);
  }

  private formatApprovedObjectives(plan: any): string {
    return (plan.topics ?? [])
      .filter((topic: any) => topic.included)
      .map((topic: any) => {
        const subtopics = (topic.subtopics ?? [])
          .filter((subtopic: any) => subtopic.included)
          .map((subtopic: any) => `  - ${subtopic.title}`)
          .join('\n');
        return `- ${topic.title}\n${subtopics}`;
      })
      .join('\n');
  }

  private async persistLesson(
    learning: Learning,
    plan: any,
    generated: GeneratedLesson,
  ): Promise<LearningLesson> {
    await this.supabaseService.client
      .from('learning_lessons')
      .update({ status: 'archived' })
      .eq('learning_id', learning.id)
      .eq('user_id', learning.user_id)
      .neq('status', 'completed');

    const { data: lesson, error: lessonError } = await this.supabaseService.client
      .from('learning_lessons')
      .insert({
        learning_id: learning.id,
        learning_plan_id: plan.id,
        user_id: learning.user_id,
        status: 'in_progress',
        title: generated.title,
        summary: generated.summary,
        total_questions: generated.questions.length,
        current_question_index: 0,
        correct_answers: 0,
      })
      .select('*')
      .single();

    if (lessonError || !lesson) {
      throw new InternalServerErrorException(
        lessonError?.message || 'Failed to create lesson',
      );
    }

    const imageCandidates = await this.getAllImageCandidatesForLearning(learning.id);
    const imageMap = new Map(imageCandidates.map((image) => [image.id, image]));

    const questionRows = generated.questions.map((question, index) => {
      const shuffledQuestion = this.shuffleQuestionChoices(question);
      const questionImage = question.questionImageId
        ? imageMap.get(question.questionImageId) ?? null
        : null;
      const explanationImage = question.explanationImageId
        ? imageMap.get(question.explanationImageId) ?? null
        : null;

      return {
        learning_lesson_id: lesson.id,
        learning_id: learning.id,
        user_id: learning.user_id,
        objective_title: question.objectiveTitle,
        question_type: question.questionType,
        prompt: question.prompt,
        question_image_id: questionImage?.id ?? null,
        question_image_url: questionImage?.image_url ?? null,
        choices: shuffledQuestion.choices,
        correct_choice_index: shuffledQuestion.correctChoiceIndex,
        weightage: question.weightage,
        hint_text: question.hintText,
        explanation_text: question.explanationText,
        explanation_image_id: explanationImage?.id ?? null,
        explanation_image_url: explanationImage?.image_url ?? null,
        order_index: index,
        hint_requests: 0,
        metadata: {
          pages: [
            ...(questionImage?.page_number ? [questionImage.page_number] : []),
            ...(explanationImage?.page_number ? [explanationImage.page_number] : []),
          ],
        },
      };
    });

    if (questionRows.length > 0) {
      const { error } = await this.supabaseService.client
        .from('learning_lesson_questions')
        .insert(questionRows);

      if (error) {
        throw new InternalServerErrorException(error.message);
      }
    }

    return lesson as LearningLesson;
  }

  private shuffleQuestionChoices(
    question: GeneratedLesson['questions'][number],
  ): GeneratedLesson['questions'][number] {
    const entries = question.choices.map((choice, index) => ({
      choice,
      isCorrect: index === question.correctChoiceIndex,
    }));

    for (let index = entries.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [entries[index], entries[swapIndex]] = [entries[swapIndex], entries[index]];
    }

    const correctChoiceIndex = entries.findIndex((entry) => entry.isCorrect);
    if (correctChoiceIndex === -1) {
      throw new InternalServerErrorException(
        'Failed to preserve the correct answer while shuffling choices',
      );
    }

    return {
      ...question,
      choices: entries.map((entry) => entry.choice),
      correctChoiceIndex,
    };
  }

  private async getLatestLesson(
    learningId: string,
    userId: string,
  ): Promise<LearningLesson | null> {
    const { data, error } = await this.supabaseService.client
      .from('learning_lessons')
      .select('*')
      .eq('learning_id', learningId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data as LearningLesson | null) ?? null;
  }

  private async getLessonById(
    lessonId: string,
    learningId: string,
    userId: string,
  ): Promise<LearningLesson> {
    const { data, error } = await this.supabaseService.client
      .from('learning_lessons')
      .select('*')
      .eq('id', lessonId)
      .eq('learning_id', learningId)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Lesson not found');
    }

    return data as LearningLesson;
  }

  private async getLessonQuestions(
    lessonId: string,
    learningId: string,
    userId: string,
  ): Promise<LearningLessonQuestion[]> {
    const { data, error } = await this.supabaseService.client
      .from('learning_lesson_questions')
      .select('*')
      .eq('learning_lesson_id', lessonId)
      .eq('learning_id', learningId)
      .eq('user_id', userId)
      .order('order_index', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return ((data ?? []) as Array<any>).map((item) => ({
      ...item,
      choices: Array.isArray(item.choices) ? item.choices : [],
    }));
  }

  private async getQuestion(
    questionId: string,
    learningId: string,
    userId: string,
  ): Promise<LearningLessonQuestion> {
    const { data, error } = await this.supabaseService.client
      .from('learning_lesson_questions')
      .select('*')
      .eq('id', questionId)
      .eq('learning_id', learningId)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Question not found');
    }

    return {
      ...(data as any),
      choices: Array.isArray((data as any).choices) ? (data as any).choices : [],
    };
  }

  private getCurrentQuestion(
    lesson: LearningLesson | null,
    questions: LearningLessonQuestion[],
  ): LearningLessonQuestion | null {
    if (!lesson || questions.length === 0) return null;
    return (
      questions[lesson.current_question_index] ??
      questions.find((question) => !question.answered_correctly) ??
      questions[questions.length - 1]
    );
  }

  private async getRelevantContext(
    learningId: string,
    query: string,
  ): Promise<string> {
    const rows = await this.getRelevantChunkRows(learningId, query, 6);
    return rows
      .map((row) =>
        [
          `Page ${row.page_number ?? '?'}`,
          row.section_title ? `Section: ${row.section_title}` : null,
          row.chunk_text,
        ]
          .filter(Boolean)
          .join(' — '),
      )
      .join('\n\n')
      .slice(0, 12000);
  }

  private async getRelevantChunkRows(
    learningId: string,
    query: string,
    count: number,
  ): Promise<
    Array<{
      id: string;
      page_number?: number | null;
      section_title?: string | null;
      chunk_text: string;
      image_ids?: string[] | null;
    }>
  > {
    const embedding = await this.azureOpenAiService.embedQuery(query);
    const { data, error } = await this.supabaseService.client.rpc(
      'match_learning_document_chunks',
      {
        query_embedding: `[${embedding.join(',')}]`,
        target_learning_id: learningId,
        match_count: count,
      },
    );

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []) as Array<{
      id: string;
      page_number?: number | null;
      section_title?: string | null;
      chunk_text: string;
      image_ids?: string[] | null;
    }>;
  }

  private async getImageCandidates(
    learningId: string,
    imageIds: string[],
  ): Promise<Array<any>> {
    if (imageIds.length === 0) {
      return [];
    }

    const { data, error } = await this.supabaseService.client
      .from('learning_document_images')
      .select('id, page_number, caption, image_url')
      .eq('learning_id', learningId)
      .in('id', imageIds);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ?? [];
  }

  private async getAllImageCandidatesForLearning(
    learningId: string,
  ): Promise<Array<any>> {
    const { data, error } = await this.supabaseService.client
      .from('learning_document_images')
      .select('id, page_number, caption, image_url')
      .eq('learning_id', learningId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ?? [];
  }

  private async buildLessonSummary(
    lesson: LearningLesson,
    questions: LearningLessonQuestion[],
  ): Promise<LessonSummary> {
    const attemptsByQuestion = await this.getAttemptsForLesson(
      lesson.id,
      lesson.learning_id,
      lesson.user_id,
    );

    const grouped = new Map<
      string,
      {
        questions: LearningLessonQuestion[];
        durations: number[];
        correctAttemptCount: number;
        wrongAttemptCount: number;
        totalWeightage: number;
      }
    >();

    for (const question of questions) {
      const attempts = attemptsByQuestion.get(question.id) ?? [];
      const attemptDurations = attempts
        .map((attempt) => attempt.responseTimeMs)
        .filter((value): value is number => typeof value === 'number');
      const entry = grouped.get(question.objective_title) ?? {
        questions: [],
        durations: [],
        correctAttemptCount: 0,
        wrongAttemptCount: 0,
        totalWeightage: 0,
      };

      entry.questions.push(question);
      entry.durations.push(...attemptDurations);
      entry.totalWeightage += question.weightage ?? 1;
      entry.correctAttemptCount += attempts.filter((attempt) => attempt.isCorrect).length;
      entry.wrongAttemptCount += attempts.filter((attempt) => !attempt.isCorrect).length;

      grouped.set(question.objective_title, entry);
    }

    const objectiveCoverage: LessonObjectiveMetric[] = Array.from(
      grouped.entries(),
    ).map(([objectiveTitle, entry]) => {
      const weightedPossible = entry.questions.reduce(
        (sum, question) => sum + (question.weightage ?? 1) * 100,
        0,
      );

      const weightedEarned = entry.questions.reduce((sum, question) => {
        const attempts = attemptsByQuestion.get(question.id) ?? [];
        const wrongAttemptCount = attempts.filter((attempt) => !attempt.isCorrect).length;
        const wasEventuallyCorrect = attempts.some((attempt) => attempt.isCorrect);
        const attemptPenalty = wrongAttemptCount * 35;
        const hintPenalty = (question.hint_requests ?? 0) * 10;
        const baseScore = wasEventuallyCorrect ? 100 : 0;
        const score = Math.max(0, baseScore - attemptPenalty - hintPenalty);
        return sum + score * (question.weightage ?? 1);
      }, 0);

      return {
        objective_title: objectiveTitle,
        mastery_score:
          weightedPossible > 0
            ? Number(((weightedEarned / weightedPossible) * 100).toFixed(1))
            : 0,
        correct_attempt_count: entry.correctAttemptCount,
        wrong_attempt_count: entry.wrongAttemptCount,
        avg_response_time_ms: this.average(entry.durations),
        total_weightage: entry.totalWeightage,
      };
    });

    const totalObjectives = objectiveCoverage.length || 1;
    const objectivesClearedOnFirstAttempt = objectiveCoverage.filter(
      (objective) => objective.wrong_attempt_count === 0,
    ).length;

    const totalPossibleWeight = questions.reduce(
      (sum, question) => sum + (question.weightage ?? 1) * 100,
      0,
    );
    const totalEarnedWeight = questions.reduce((sum, question) => {
      const attempts = attemptsByQuestion.get(question.id) ?? [];
      const wrongAttemptCount = attempts.filter((attempt) => !attempt.isCorrect).length;
      const wasEventuallyCorrect = attempts.some((attempt) => attempt.isCorrect);
      const attemptPenalty = wrongAttemptCount * 35;
      const hintPenalty = (question.hint_requests ?? 0) * 10;
      const baseScore = wasEventuallyCorrect ? 100 : 0;
      const score = Math.max(0, baseScore - attemptPenalty - hintPenalty);
      return sum + score * (question.weightage ?? 1);
    }, 0);

    const frictionZones: LessonFrictionZone[] = questions
      .filter((question) => (question.hint_requests ?? 0) >= 3)
      .map((question) => ({
        question_id: question.id,
        objective_title: question.objective_title,
        order_index: question.order_index,
        hint_requests: question.hint_requests,
        page_refs: this.extractPageRefs(question.metadata),
      }));

    return {
      mastery_index: Number(
        ((objectivesClearedOnFirstAttempt / totalObjectives) * 100).toFixed(1),
      ),
      weighted_score:
        totalPossibleWeight > 0
          ? Number(((totalEarnedWeight / totalPossibleWeight) * 100).toFixed(1))
          : 0,
      readiness_score: this.computeReadinessScore(
        totalPossibleWeight > 0
          ? Number(((totalEarnedWeight / totalPossibleWeight) * 100).toFixed(1))
          : 0,
        Number(
          ((objectivesClearedOnFirstAttempt / totalObjectives) * 100).toFixed(1),
        ),
        frictionZones.length,
      ),
      velocity_metric: objectiveCoverage.map((objective) => ({
        objective_title: objective.objective_title,
        avg_response_time_ms: objective.avg_response_time_ms,
      })),
      friction_zones: frictionZones,
      objective_coverage: objectiveCoverage,
      attempt_multiplicity: objectiveCoverage.map((objective) => ({
        objective_title: objective.objective_title,
        correct_attempt_count: objective.correct_attempt_count,
        wrong_attempt_count: objective.wrong_attempt_count,
      })),
      study_tips: this.buildStudyTips(objectiveCoverage, frictionZones),
    };
  }

  private async getAttemptsForLesson(
    lessonId: string,
    learningId: string,
    userId: string,
  ): Promise<
    Map<
      string,
      Array<{
        responseTimeMs: number | null;
        isCorrect: boolean;
      }>
    >
  > {
    const { data, error } = await this.supabaseService.client
      .from('learning_lesson_attempts')
      .select('learning_lesson_question_id, response_time_ms, is_correct, created_at')
      .eq('learning_lesson_id', lessonId)
      .eq('learning_id', learningId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const map = new Map<
      string,
      Array<{
        responseTimeMs: number | null;
        isCorrect: boolean;
      }>
    >();
    for (const row of data ?? []) {
      const id = String(row.learning_lesson_question_id);
      const attempts = map.get(id) ?? [];
      attempts.push({
        responseTimeMs:
          typeof row.response_time_ms === 'number' ? row.response_time_ms : null,
        isCorrect: Boolean(row.is_correct),
      });
      map.set(id, attempts);
    }
    return map;
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }

  private extractPageRefs(metadata?: Record<string, unknown>): Array<number | string> {
    if (!metadata || typeof metadata !== 'object') {
      return [];
    }
    const pages = (metadata as Record<string, unknown>).pages;
    return Array.isArray(pages) ? (pages as Array<number | string>).slice(0, 5) : [];
  }

  private buildStudyTips(
    objectiveCoverage: LessonObjectiveMetric[],
    frictionZones: LessonFrictionZone[],
  ): string[] {
    const weakestObjectives = [...objectiveCoverage]
      .sort((a, b) => a.mastery_score - b.mastery_score)
      .slice(0, 3);
    const slowestObjectives = [...objectiveCoverage]
      .filter((objective) => objective.avg_response_time_ms > 0)
      .sort((a, b) => b.avg_response_time_ms - a.avg_response_time_ms)
      .slice(0, 2);

    const tips: string[] = [];

    if (weakestObjectives.length > 0) {
      tips.push(
        `Revisit ${weakestObjectives
          .map((objective) => objective.objective_title)
          .join(', ')} first, because those objectives showed the lowest mastery scores.`,
      );
    }

    if (slowestObjectives.length > 0) {
      tips.push(
        `Spend a focused review pass on ${slowestObjectives
          .map((objective) => objective.objective_title)
          .join(', ')} to improve response speed and confidence.`,
      );
    }

    if (frictionZones.length > 0) {
      tips.push(
        `Questions tied to ${frictionZones
          .map((zone) => zone.objective_title)
          .slice(0, 3)
          .join(', ')} triggered repeated hints, so revisit those diagrams and explanations carefully.`,
      );
    }

    if (tips.length === 0) {
      tips.push(
        'You handled this lesson smoothly. A faster second pass can strengthen recall and long-term retention.',
      );
    }

    return tips;
  }

  private computeReadinessScore(
    weightedScore: number,
    masteryIndex: number,
    frictionZoneCount: number,
  ): number {
    const score = weightedScore * 0.6 + masteryIndex * 0.4 - frictionZoneCount * 3;
    return Math.max(0, Math.min(100, Number(score.toFixed(1))));
  }

  private async deleteLessonArtifacts(learningId: string, userId: string) {
    const { data: lessonThreads } = await this.supabaseService.client
      .from('learning_chat_threads')
      .select('id')
      .eq('learning_id', learningId)
      .eq('user_id', userId)
      .eq('thread_type', 'lesson');

    const lessonThreadIds = (lessonThreads ?? []).map((thread) => thread.id);

    if (lessonThreadIds.length > 0) {
      await this.supabaseService.client
        .from('learning_chat_messages')
        .delete()
        .eq('learning_id', learningId)
        .eq('user_id', userId)
        .in('learning_chat_thread_id', lessonThreadIds);
    }

    await this.supabaseService.client
      .from('learning_chat_threads')
      .delete()
      .eq('learning_id', learningId)
      .eq('user_id', userId)
      .eq('thread_type', 'lesson');

    await this.supabaseService.client
      .from('learning_lesson_attempts')
      .delete()
      .eq('learning_id', learningId)
      .eq('user_id', userId);

    await this.supabaseService.client
      .from('learning_lesson_questions')
      .delete()
      .eq('learning_id', learningId)
      .eq('user_id', userId);

    await this.supabaseService.client
      .from('learning_lessons')
      .delete()
      .eq('learning_id', learningId)
      .eq('user_id', userId);
  }
}
