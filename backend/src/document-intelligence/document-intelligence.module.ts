import { Global, Module } from '@nestjs/common';
import { DocumentIntelligenceService } from './document-intelligence.service';

@Global()
@Module({
  providers: [DocumentIntelligenceService],
  exports: [DocumentIntelligenceService],
})
export class DocumentIntelligenceModule {}
