import { IsString, MinLength, MaxLength } from 'class-validator';

export class ChatStreamDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string;
}
