import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { SupabaseModule } from './supabase/supabase.module';
import { AzureModule } from './azure/azure.module';
import { AzureOpenAiModule } from './azure-openai/azure-openai.module';
import { DocumentIntelligenceModule } from './document-intelligence/document-intelligence.module';
import { HealthModule } from './health/health.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { LangGraphModule } from './langgraph/langgraph.module';
import { LessonModule } from './lesson/lesson.module';
import { LearningsModule } from './learnings/learnings.module';
import { StudyPlanModule } from './study-plan/study-plan.module';
import { TemporalModule } from './temporal/temporal.module';

@Module({
  imports: [
    // Support running from either the repo root or backend directory.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        resolve(process.cwd(), '.env'),
        resolve(process.cwd(), 'backend/.env'),
      ],
    }),
    SupabaseModule,
    AzureModule,
    AzureOpenAiModule,
    DocumentIntelligenceModule,
    LangGraphModule,
    TemporalModule,
    IngestionModule,
    LessonModule,
    StudyPlanModule,
    HealthModule,
    LearningsModule,
  ],
})
export class AppModule {}
