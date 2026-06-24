import { Module } from '@nestjs/common';
import { LearningsController } from './learnings.controller';
import { LearningsService } from './learnings.service';
import { IngestionModule } from '../ingestion/ingestion.module';

@Module({
  imports: [IngestionModule],
  controllers: [LearningsController],
  providers: [LearningsService],
})
export class LearningsModule {}
