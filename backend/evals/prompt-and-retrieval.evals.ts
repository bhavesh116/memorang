import * as assert from 'node:assert/strict';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AzureOpenAiService } from '../src/azure-openai/azure-openai.service';
import { LessonService } from '../src/lesson/lesson.service';
import { StudyPlanService } from '../src/study-plan/study-plan.service';
import { DocumentActivities } from '../src/temporal/activities/document.activities';

type AsyncTest = () => Promise<void> | void;

const tests: Array<{ name: string; run: AsyncTest }> = [];

function test(name: string, run: AsyncTest) {
  tests.push({ name, run });
}

function messageText(message: { content: unknown }): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry;
        }

        if (entry && typeof entry === 'object' && 'text' in entry) {
          return String((entry as { text: unknown }).text);
        }

        return JSON.stringify(entry);
      })
      .join('\n');
  }

  return String(message.content);
}

function createStructuredModelMock<T>(
  result: T,
  sink: { messages?: unknown[]; temperature?: number },
) {
  return {
    createChatModel(options?: { temperature?: number }) {
      sink.temperature = options?.temperature;
      return {
        withStructuredOutput() {
          return {
            async invoke(messages: unknown[]) {
              sink.messages = messages;
              return result;
            },
          };
        },
      };
    },
  };
}

function createSupabaseUpdateChain() {
  const chain: { eq: (field: string, value: unknown) => typeof chain } = {
    eq() {
      return chain;
    },
  };

  return chain;
}

test('study plan generation prompt includes difficulty, metadata, and document context', async () => {
  const captured: { messages?: unknown[]; temperature?: number } = {};
  const azureMock = createStructuredModelMock(
    {
      title: 'Advanced Cardiology Plan',
      summary: 'Covers cardiac electrophysiology and hemodynamics.',
      rationale: 'Ordered from fundamentals to interpretation.',
      topics: [],
    },
    captured,
  );
  const service = new StudyPlanService({} as any, azureMock as any);

  (service as any).getLearningOrThrow = async () => ({
    id: 'learning-1',
    user_id: 'user-1',
    title: 'Cardiology Basics',
    description: 'ECG interpretation and cardiac cycle review',
  });
  (service as any).buildPlanContext = async () =>
    'Page 1 — Section: Cardiac Cycle — Systole and diastole overview';
  (service as any).persistGeneratedPlan = async () => ({ id: 'plan-1' });
  (service as any).updateLearningPlanState = async () => undefined;

  await service.generateStudyPlanForLearning('learning-1', 'user-1', 'Hard');

  assert.equal(captured.temperature, 0.1);
  assert.ok(Array.isArray(captured.messages));
  assert.equal(captured.messages?.length, 2);
  assert.ok(captured.messages?.[0] instanceof SystemMessage);
  assert.ok(captured.messages?.[1] instanceof HumanMessage);

  const systemText = messageText(captured.messages?.[0] as { content: unknown });
  const humanText = messageText(captured.messages?.[1] as { content: unknown });

  assert.match(systemText, /structured learning path/i);
  assert.match(systemText, /Target difficulty: Hard/);
  assert.match(systemText, /selectively include or omit topics before approval/i);

  assert.match(humanText, /Learning title: Cardiology Basics/);
  assert.match(humanText, /Learning description: ECG interpretation and cardiac cycle review/);
  assert.match(humanText, /Requested difficulty: Hard/);
  assert.match(humanText, /Document context:/);
  assert.match(humanText, /Cardiac Cycle/);
});

test('plan edit extraction prompt constrains edits to explicit selection requests', async () => {
  const captured: { messages?: unknown[]; temperature?: number } = {};
  const azureMock = createStructuredModelMock(
    {
      topicSelections: [],
      subtopicSelections: [],
    },
    captured,
  );
  const service = new StudyPlanService({} as any, azureMock as any);

  (service as any).getLatestPlan = async () => ({
    id: 'plan-1',
    topics: [
      {
        id: 'topic-1',
        title: 'Electrophysiology',
        included: true,
        subtopics: [
          { id: 'subtopic-1', title: 'Action Potentials', included: true },
          { id: 'subtopic-2', title: 'Conduction Pathways', included: false },
        ],
      },
    ],
  });
  (service as any).updateTopicSelection = async () => undefined;
  (service as any).updateSubtopicSelection = async () => undefined;

  const result = await service.applyChatRequestedPlanChanges(
    'learning-1',
    'user-1',
    'Skip conduction pathways for now.',
  );

  assert.deepEqual(result.changes, []);
  assert.equal(captured.temperature, 0);

  const systemText = messageText(captured.messages?.[0] as { content: unknown });
  const humanText = messageText(captured.messages?.[1] as { content: unknown });

  assert.match(systemText, /Only produce changes when the user clearly wants to include, skip, omit, focus on, or exclude/i);
  assert.match(systemText, /Use the exact topic and subtopic titles from the provided plan/i);
  assert.match(systemText, /Return empty arrays if there is no explicit selection change request/i);

  assert.match(humanText, /Current plan:/);
  assert.match(humanText, /Electrophysiology \[included\]/);
  assert.match(humanText, /Action Potentials \[included\]/);
  assert.match(humanText, /Conduction Pathways \[excluded\]/);
  assert.match(humanText, /User message: Skip conduction pathways for now\./);
});

test('study planning chat prompt changes behavior before and after approval', async () => {
  const service = new StudyPlanService({} as any, {} as any);

  (service as any).getLearningOrThrow = async () => ({
    id: 'learning-1',
    title: 'Neuroanatomy',
    description: null,
    plan_status: 'approved',
  });
  (service as any).getRequiredPlan = async () => ({
    difficulty: 'Intermediate',
    summary: 'Start with gross anatomy before tracts.',
    topics: [
      {
        title: 'Brainstem',
        included: true,
        subtopics: [{ title: 'Cranial Nuclei', included: true }],
      },
    ],
  });
  (service as any).getRelevantContext = async () =>
    'Page 12 — Section: Brainstem — Cranial nerve nuclei are clustered by modality.';

  const approvedPrompt = await (service as any).buildChatSystemPrompt(
    'learning-1',
    'user-1',
    'Can we review the current plan?',
    ['Included topic "Brainstem"'],
  );

  assert.match(approvedPrompt, /The plan has been approved/);
  assert.match(approvedPrompt, /do not modify approved selections/i);
  assert.match(approvedPrompt, /Applied changes this turn: Included topic "Brainstem"/);
  assert.match(approvedPrompt, /Current selected plan:/);
  assert.match(approvedPrompt, /Brainstem \[included\]/);
  assert.match(approvedPrompt, /Relevant document context:/);
  assert.match(approvedPrompt, /Cranial nerve nuclei/);

  (service as any).getLearningOrThrow = async () => ({
    id: 'learning-1',
    title: 'Neuroanatomy',
    description: null,
    plan_status: 'ready_for_review',
  });
  (service as any).getRelevantContext = async () => '';

  const pendingPrompt = await (service as any).buildChatSystemPrompt(
    'learning-1',
    'user-1',
    'What should I focus on next?',
    [],
  );

  assert.match(pendingPrompt, /The plan is awaiting user approval/);
  assert.match(pendingPrompt, /Approve button/);
  assert.match(pendingPrompt, /Applied changes this turn: none/);
  assert.match(pendingPrompt, /No focused context found; rely on the plan\./);
});

test('study plan retrieval context uses query embeddings and truncates long output', async () => {
  let rpcArgs: Record<string, unknown> | undefined;

  const service = new StudyPlanService(
    {
      client: {
        rpc(name: string, args: Record<string, unknown>) {
          rpcArgs = { name, ...args };
          return Promise.resolve({
            data: [
              {
                page_number: 2,
                section_title: 'Cardiac Cycle',
                chunk_text: 'A'.repeat(13000),
              },
            ],
            error: null,
          });
        },
      },
    } as any,
    {
      embedQuery: async (query: string) => {
        assert.equal(query, 'systole');
        return [0.25, 0.5, 0.75];
      },
    } as any,
  );

  const context = await (service as any).getRelevantContext('learning-1', 'systole');

  assert.equal(rpcArgs?.name, 'match_learning_document_chunks');
  assert.equal(rpcArgs?.query_embedding, '[0.25,0.5,0.75]');
  assert.equal(rpcArgs?.target_learning_id, 'learning-1');
  assert.equal(rpcArgs?.match_count, 6);
  assert.match(context, /^Page 2 — Section: Cardiac Cycle — A+/);
  assert.equal(context.length, 12000);
});

test('lesson generation prompt includes objective coverage, approved objectives, and image context', async () => {
  const captured: { messages?: unknown[]; temperature?: number } = {};
  const azureMock = createStructuredModelMock(
    {
      title: 'Lesson 1',
      summary: 'Foundational arrhythmia review',
      questions: [
        {
          objectiveTitle: 'Arrhythmias',
          questionType: 'text',
          prompt: 'Which arrhythmia is characterized by irregularly irregular rhythm?',
          questionImageId: null,
          choices: ['AF', 'SVT', 'VT', 'VF'],
          correctChoiceIndex: 0,
          weightage: 8,
          hintText: 'Think about the classic pulse finding.',
          explanationText: 'Atrial fibrillation is irregularly irregular due to chaotic atrial activity.',
          explanationImageId: null,
        },
      ],
    },
    captured,
  );

  const studyPlanServiceMock = {
    async getLearningForUser() {
      return {
        id: 'learning-1',
        user_id: 'user-1',
        plan_status: 'approved',
        stage: 'user_approved_study',
      };
    },
    async getRequiredPlanForLearning() {
      return {
        id: 'plan-1',
        difficulty: 'Intermediate',
        topics: [
          {
            title: 'Arrhythmias',
            included: true,
            subtopics: [{ title: 'Atrial Fibrillation', included: true }],
          },
        ],
      };
    },
  };
  const supabaseMock = {
    client: {
      from(table: string) {
        assert.equal(table, 'learnings');
        return {
          update() {
            return createSupabaseUpdateChain();
          },
        };
      },
    },
  };
  const service = new LessonService(
    supabaseMock as any,
    azureMock as any,
    studyPlanServiceMock as any,
    {} as any,
    {} as any,
  );

  (service as any).getLatestLesson = async () => null;
  (service as any).buildTopicLessonContext = async () =>
    'Objective: Arrhythmias\nPage 4 — Section: ECG Findings — Irregularly irregular rhythm.\nImage candidates:\n- image-1: ECG strip (page 4)';
  (service as any).buildImageReferenceMap = async () =>
    '- Image image-1 (page 4): ECG strip — https://example.com/ecg.png';
  (service as any).persistLesson = async () => ({ id: 'lesson-1' });
  (service as any).getWorkspace = async () => ({ lesson: { id: 'lesson-1' } });

  await service.startLesson('learning-1', 'user-1');

  assert.equal(captured.temperature, 0.2);
  assert.equal(captured.messages?.length, 2);

  const systemText = messageText(captured.messages?.[0] as { content: unknown });
  const humanText = messageText(captured.messages?.[1] as { content: unknown });

  assert.match(systemText, /mastery-oriented MCQ lesson/i);
  assert.match(systemText, /Cover every listed subtopic with at least two distinct questions/i);
  assert.match(systemText, /At least one third of questions MUST use questionType "image"/i);
  assert.match(systemText, /Hints must support reasoning without revealing the answer directly/i);

  assert.match(humanText, /Topic: Arrhythmias/);
  assert.match(humanText, /Target question count for this topic: 4/);
  assert.match(humanText, /Target difficulty: Intermediate/);
  assert.match(humanText, /Subtopics to cover deeply:/);
  assert.match(humanText, /Atrial Fibrillation/);
  assert.match(humanText, /Generate all questions for this topic now/);
  assert.match(humanText, /Topic-specific document context and image candidates:/);
  assert.match(humanText, /Image candidates:/);
});

test('lesson coach prompt reinforces hint-only behavior and current question grounding', async () => {
  const studyPlanServiceMock = {
    async getRequiredPlanForLearning() {
      return {
        topics: [
          {
            title: 'Arrhythmias',
            included: true,
            subtopics: [{ title: 'Atrial Fibrillation', included: true }],
          },
        ],
      };
    },
  };
  const service = new LessonService(
    {} as any,
    {} as any,
    studyPlanServiceMock as any,
    {} as any,
    {} as any,
  );

  (service as any).getRelevantContext = async () =>
    'Page 7 — Section: ECG Interpretation — Fibrillatory waves may be subtle.';

  const prompt = await (service as any).buildLessonCoachPrompt(
    'learning-1',
    'user-1',
    {
      objective_title: 'Arrhythmias',
      prompt: 'Which rhythm is irregularly irregular?',
    },
  );

  assert.match(prompt, /You are Memorang's lesson coach during the quiz loop|You are Memorang’s lesson coach during the quiz loop/);
  assert.match(prompt, /Never reveal the correct answer directly/);
  assert.match(prompt, /If the user asks for the answer, refuse gently and give a hint instead/);
  assert.match(prompt, /Current objective: Arrhythmias/);
  assert.match(prompt, /Current question: Which rhythm is irregularly irregular\?/);
  assert.match(prompt, /Approved objectives:/);
  assert.match(prompt, /Atrial Fibrillation/);
  assert.match(prompt, /Relevant document context:/);
  assert.match(prompt, /Fibrillatory waves/);
});

test('lesson retrieval context formats page and section labels and truncates long output', async () => {
  const service = new LessonService({} as any, {} as any, {} as any, {} as any, {} as any);

  (service as any).getRelevantChunkRows = async () => [
    {
      id: 'chunk-1',
      page_number: 3,
      section_title: 'Afterload',
      chunk_text: 'B'.repeat(13000),
    },
  ];

  const context = await (service as any).getRelevantContext('learning-1', 'afterload');

  assert.match(context, /^Page 3 — Section: Afterload — B+/);
  assert.equal(context.length, 12000);
});

test('embedding helper delegates query embedding through embedTexts', async () => {
  let capturedTexts: string[] | undefined;

  const result = await AzureOpenAiService.prototype.embedQuery.call({
    async embedTexts(texts: string[]) {
      capturedTexts = texts;
      return [[0.01, 0.02, 0.03]];
    },
  }, 'ventricular depolarization');

  assert.deepEqual(capturedTexts, ['ventricular depolarization']);
  assert.deepEqual(result, [0.01, 0.02, 0.03]);
});

test('document embedding pipeline batches chunks, formats vectors, and updates progress', async () => {
  const chunkRows = Array.from({ length: 10 }, (_, index) => ({
    id: `chunk-${index + 1}`,
    chunk_text: `chunk text ${index + 1}`,
  }));
  const storedEmbeddings: Array<{ id: string; embedding: string }> = [];
  const progressUpdates: Array<Record<string, unknown>> = [];
  const batchSizes: number[] = [];
  const events: Array<{ type: string; message: string }> = [];

  const supabaseMock = {
    client: {
      from(table: string) {
        if (table === 'learning_document_chunks') {
          return {
            select() {
              return {
                eq() {
                  return {
                    order() {
                      return Promise.resolve({ data: chunkRows, error: null });
                    },
                  };
                },
              };
            },
            update(payload: { embedding: string }) {
              return {
                eq(field: string, id: string) {
                  assert.equal(field, 'id');
                  storedEmbeddings.push({ id, embedding: payload.embedding });
                  return { error: null };
                },
              };
            },
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    },
  };
  const azureMock = {
    async embedTexts(texts: string[]) {
      batchSizes.push(texts.length);
      return texts.map((_, index) => [texts.length, index + 1]);
    },
  };
  const activities = new DocumentActivities(
    supabaseMock as any,
    {} as any,
    azureMock as any,
    {} as any,
    {} as any,
  );

  (activities as any).updateLearning = async (
    learningId: string,
    payload: Record<string, unknown>,
  ) => {
    assert.equal(learningId, 'learning-1');
    progressUpdates.push(payload);
  };
  (activities as any).logEvent = async (
    learningId: string,
    type: string,
    message: string,
  ) => {
    assert.equal(learningId, 'learning-1');
    events.push({ type, message });
  };

  const embeddedCount = await activities.embedDocumentChunks({
    learningId: 'learning-1',
    userId: 'user-1',
    pdfBlobName: 'cardiology.pdf',
    pdfUrl: 'https://example.com/cardiology.pdf',
  });

  assert.equal(embeddedCount, 10);
  assert.deepEqual(batchSizes, [8, 2]);
  assert.equal(storedEmbeddings.length, 10);
  assert.deepEqual(storedEmbeddings[0], {
    id: 'chunk-1',
    embedding: '[8,1]',
  });
  assert.deepEqual(storedEmbeddings[9], {
    id: 'chunk-10',
    embedding: '[2,2]',
  });
  assert.equal(progressUpdates.length, 2);
  assert.deepEqual(
    progressUpdates.map((update) => update.ingestion_progress_pct),
    [88, 95],
  );
  assert.equal(progressUpdates[0].ingestion_status, 'embedding');
  assert.deepEqual(events, [
    {
      type: 'embedded',
      message: 'Generated embeddings for 10 chunks',
    },
  ]);
});

async function main() {
  let passed = 0;

  for (const entry of tests) {
    try {
      await entry.run();
      passed += 1;
      console.log(`PASS ${entry.name}`);
    } catch (error) {
      console.error(`FAIL ${entry.name}`);
      console.error(error);
      process.exitCode = 1;
      break;
    }
  }

  if (process.exitCode && process.exitCode !== 0) {
    return;
  }

  console.log(`\n${passed}/${tests.length} evals passed`);
}

void main();
