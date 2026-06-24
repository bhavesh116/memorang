import { IsInt, Min } from 'class-validator';

export class AnswerQuestionDto {
  @IsInt()
  @Min(0)
  selectedChoiceIndex!: number;

  @IsInt()
  @Min(0)
  responseTimeMs!: number;
}
