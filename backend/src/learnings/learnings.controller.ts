import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { LearningsService } from './learnings.service';
import { CreateLearningDto } from './dto/create-learning.dto';
import { UpdateLearningDto } from './dto/update-learning.dto';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../types/learning';

@Controller('learnings')
@UseGuards(SupabaseAuthGuard)
export class LearningsController {
  constructor(private readonly learningsService: LearningsService) {}

  // GET /learnings
  @Get()
  async findAll(@CurrentUser() user: AuthUser) {
    const learnings = await this.learningsService.findAll(user.id);
    return { learnings };
  }

  // POST /learnings
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateLearningDto,
  ) {
    const learning = await this.learningsService.create(user.id, dto);
    return { learning };
  }

  // GET /learnings/:id
  @Get(':id')
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const learning = await this.learningsService.findOne(id, user.id);
    return { learning };
  }

  // GET /learnings/:id/status
  @Get(':id/status')
  async getStatus(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const learning = await this.learningsService.getStatus(id, user.id);
    return { learning };
  }

  // PATCH /learnings/:id
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateLearningDto,
  ) {
    const learning = await this.learningsService.update(id, user.id, dto);
    return { learning };
  }

  // DELETE /learnings/:id
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.learningsService.remove(id, user.id);
    return { success: true };
  }

  // POST /learnings/:id/upload
  @Post(':id/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),   // keep file in memory as Buffer
      limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
    }),
  )
  async uploadPdf(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: 'application/pdf' }),
        ],
        fileIsRequired: true,
        exceptionFactory: (error) => new BadRequestException(error),
      }),
    )
    file: Express.Multer.File,
  ) {
    const learning = await this.learningsService.uploadPdf(id, user.id, file);
    return { learning, pdf_url: learning.pdf_url };
  }

  // POST /learnings/:id/reprocess
  @Post(':id/reprocess')
  async restartIngestion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    const learning = await this.learningsService.restartIngestion(id, user.id);
    return { learning };
  }
}
