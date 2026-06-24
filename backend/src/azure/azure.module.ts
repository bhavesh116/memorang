import { Module, Global } from '@nestjs/common';
import { AzureService } from './azure.service';

@Global()
@Module({
  providers: [AzureService],
  exports: [AzureService],
})
export class AzureModule {}
