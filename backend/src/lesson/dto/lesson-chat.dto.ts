import { IsString, MinLength, MaxLength } from 'class-validator';

export class LessonChatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(3000)
  message!: string;
}
