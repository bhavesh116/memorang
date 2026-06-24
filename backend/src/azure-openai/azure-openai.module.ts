import { Global, Module } from '@nestjs/common';
import { AzureOpenAiService } from './azure-openai.service';

@Global()
@Module({
  providers: [AzureOpenAiService],
  exports: [AzureOpenAiService],
})
export class AzureOpenAiModule {}
