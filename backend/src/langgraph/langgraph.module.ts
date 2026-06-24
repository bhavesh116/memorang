import { Global, Module } from '@nestjs/common';
import { LangGraphService } from './langgraph.service';

@Global()
@Module({
  providers: [LangGraphService],
  exports: [LangGraphService],
})
export class LangGraphModule {}
