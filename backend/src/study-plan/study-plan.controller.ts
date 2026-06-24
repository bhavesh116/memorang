import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { AuthUser } from '../types/learning';
import { LangGraphService } from '../langgraph/langgraph.service';
import { ChatStreamDto } from './dto/chat-stream.dto';
import { UpdatePlanDifficultyDto } from './dto/update-plan-difficulty.dto';
import { UpdatePlanItemDto } from './dto/update-plan-item.dto';
import { StudyPlanService } from './study-plan.service';

@Controller('learnings/:id')
@UseGuards(SupabaseAuthGuard)
export class StudyPlanController {
  constructor(
    private readonly studyPlanService: StudyPlanService,
    private readonly langGraphService: LangGraphService,
  ) {}

  @Get('plan')
  async getWorkspace(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const workspace = await this.studyPlanService.getWorkspace(id, user.id);
    return { workspace };
  }

  @Post('plan/regenerate')
  async regeneratePlan(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePlanDifficultyDto,
  ) {
    const plan = await this.studyPlanService.generateStudyPlanForLearning(
      id,
      user.id,
      dto.difficulty,
    );
    return { plan };
  }

  @Patch('plan/topics/:topicId')
  async updateTopic(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('topicId') topicId: string,
    @Body() dto: UpdatePlanItemDto,
  ) {
    const plan = await this.studyPlanService.updateTopicSelection(
      id,
      user.id,
      topicId,
      dto.included,
    );
    return { plan };
  }

  @Patch('plan/subtopics/:subtopicId')
  async updateSubtopic(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('subtopicId') subtopicId: string,
    @Body() dto: UpdatePlanItemDto,
  ) {
    const plan = await this.studyPlanService.updateSubtopicSelection(
      id,
      user.id,
      subtopicId,
      dto.included,
    );
    return { plan };
  }

  @Post('plan/approve')
  @HttpCode(HttpStatus.OK)
  async approvePlan(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const plan = await this.studyPlanService.approvePlan(id, user.id);
    return { plan };
  }

  @Post('chat/stream')
  async streamChat(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ChatStreamDto,
    @Res() response: Response,
  ) {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    const writeEvent = (event: string, data: unknown) => {
      response.write(`event: ${event}\n`);
      response.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const userMessage = await this.studyPlanService.createUserMessage(
        id,
        user.id,
        dto.message,
      );
      const { plan, changes } =
        await this.studyPlanService.applyChatRequestedPlanChanges(
          id,
          user.id,
          dto.message,
        );
      const workspace = await this.studyPlanService.getWorkspace(id, user.id);
      const thread = workspace.thread;

      if (!plan || !thread) {
        throw new Error('Study plan is not ready yet');
      }

      writeEvent('ack', {
        userMessage,
        threadId: thread.langgraph_thread_id,
        appliedChanges: changes,
      });

      const systemPrompt = await this.studyPlanService.buildChatSystemPrompt(
        id,
        user.id,
        dto.message,
        changes,
      );

      const eventStream = await this.langGraphService.streamConversation({
        threadId: thread.langgraph_thread_id,
        learningId: id,
        systemPrompt,
        message: dto.message,
      });

      let assistantText = '';

      for await (const event of eventStream as AsyncIterable<any>) {
        if (event.event !== 'on_chat_model_stream') {
          continue;
        }

        const token = this.extractTokenText(event.data?.chunk);
        if (!token) {
          continue;
        }

        assistantText += token;
        writeEvent('token', { text: token });
      }

      const assistantMessage =
        await this.studyPlanService.createAssistantMessage({
          learningId: id,
          userId: user.id,
          content: assistantText.trim(),
          metadata: {
            appliedChanges: changes,
          },
        });

      const refreshedWorkspace = await this.studyPlanService.getWorkspace(id, user.id);

      writeEvent('message', { message: assistantMessage });
      writeEvent('plan', { plan: refreshedWorkspace.plan });
      writeEvent('done', { ok: true });
      response.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Chat stream failed';
      writeEvent('error', { message });
      response.end();
    }
  }

  private extractTokenText(chunk: unknown): string {
    if (!chunk || typeof chunk !== 'object') {
      return '';
    }

    const content = (chunk as { content?: unknown }).content;
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (typeof item === 'string') {
            return item;
          }
          if (
            item &&
            typeof item === 'object' &&
            'text' in item &&
            typeof (item as { text?: unknown }).text === 'string'
          ) {
            return (item as { text: string }).text;
          }
          return '';
        })
        .join('');
    }

    return '';
  }
}
