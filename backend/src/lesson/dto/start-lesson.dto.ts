import { IsBoolean, IsOptional } from 'class-validator';

export class StartLessonDto {
  @IsBoolean()
  @IsOptional()
  regenerate?: boolean;
}
