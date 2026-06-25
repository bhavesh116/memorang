import { Global, Module } from '@nestjs/common';
import { ImageClassificationService } from './image-classification.service';

@Global()
@Module({
  providers: [ImageClassificationService],
  exports: [ImageClassificationService],
})
export class ImageClassificationModule {}
