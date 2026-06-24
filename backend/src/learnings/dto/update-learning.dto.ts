import {
  IsString,
  IsOptional,
  IsIn,
  MinLength,
  MaxLength,
} from 'class-validator';
import { VALID_STAGES } from '../../types/learning';

export class UpdateLearningDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsIn(VALID_STAGES, {
    message: `stage must be one of: ${VALID_STAGES.join(', ')}`,
  })
  @IsOptional()
  stage?: string;
}
