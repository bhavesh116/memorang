import { Global, Module } from '@nestjs/common';
import { TemporalService } from './temporal.service';
import { DocumentActivities } from './activities/document.activities';

@Global()
@Module({
  providers: [TemporalService, DocumentActivities],
  exports: [TemporalService, DocumentActivities],
})
export class TemporalModule {}
