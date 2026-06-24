import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { AuthUser } from '../types/learning';
import { AnswerQuestionDto } from './dto/answer-question.dto';
import { LessonChatDto } from './dto/lesson-chat.dto';
import { StartLessonDto } from './dto/start-lesson.dto';
import { LessonService } from './lesson.service';

@Controller('learnings/:id/lesson')
@UseGuards(SupabaseAuthGuard)
export class LessonController {
  constructor(private readonly lessonService: LessonService) {}

  @Get()
  async getWorkspace(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const workspace = await this.lessonService.getWorkspace(id, user.id);
    return { workspace };
  }

  @Post('start')
  async startLesson(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: StartLessonDto,
  ) {
    const workspace = await this.lessonService.startLesson(
      id,
      user.id,
      dto.regenerate ?? false,
    );
    return { workspace };
  }

  @Post(':lessonId/questions/:questionId/answer')
  async answerQuestion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('lessonId') lessonId: string,
    @Param('questionId') questionId: string,
    @Body() dto: AnswerQuestionDto,
  ) {
    const result = await this.lessonService.answerQuestion({
      learningId: id,
      userId: user.id,
      lessonId,
      questionId,
      selectedChoiceIndex: dto.selectedChoiceIndex,
      responseTimeMs: dto.responseTimeMs,
    });
    return result;
  }

  @Post(':lessonId/questions/:questionId/hint')
  async getHint(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('lessonId') lessonId: string,
    @Param('questionId') questionId: string,
  ) {
    return this.lessonService.getQuestionHint({
      learningId: id,
      userId: user.id,
      lessonId,
      questionId,
    });
  }

  @Post('chat/stream')
  async streamLessonCoach(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: LessonChatDto,
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
      const { userMessage, thread, eventStream } =
        await this.lessonService.streamLessonCoach({
          learningId: id,
          userId: user.id,
          message: dto.message,
        });

      writeEvent('ack', {
        userMessage,
        threadId: thread.langgraph_thread_id,
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
        await this.lessonService.saveLessonCoachAssistantMessage({
          learningId: id,
          userId: user.id,
          content: assistantText.trim(),
        });

      writeEvent('message', { message: assistantMessage });
      writeEvent('done', { ok: true });
      response.end();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Lesson coach failed';
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
          if (typeof item === 'string') return item;
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
