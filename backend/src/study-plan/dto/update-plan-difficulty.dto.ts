import { IsIn } from 'class-validator';

export class UpdatePlanDifficultyDto {
  @IsIn(['Easy', 'Intermediate', 'Hard'])
  difficulty!: 'Easy' | 'Intermediate' | 'Hard';
}
