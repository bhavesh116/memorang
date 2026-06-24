import { IsBoolean } from 'class-validator';

export class UpdatePlanItemDto {
  @IsBoolean()
  included!: boolean;
}
