import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { AzureOpenAiService } from '../azure-openai/azure-openai.service';

export interface ImageClassificationResult {
  isInstructional: boolean;
  description: string;
  source: 'heuristic' | 'vision';
}

export interface ImageRelevanceResult {
  isRelevant: boolean;
  reason: string;
}

const classificationSchema = z.object({
  isInstructional: z.boolean(),
  description: z.string(),
});

const relevanceSchema = z.object({
  isRelevant: z.boolean(),
  reason: z.string(),
});

const DECORATIVE_CAPTION_PATTERNS = [
  /\bstock\s*photo\b/i,
  /\bshutterstock\b/i,
  /\bgetty\s*images?\b/i,
  /\bteam\s+meeting\b/i,
  /\bbusiness\s+people\b/i,
  /\bpeople\s+in\s+(a\s+)?(meeting|office)\b/i,
  /\bheadshot\b/i,
  /\bportrait\b/i,
  /\bdecorative\b/i,
  /\bplaceholder\b/i,
];

@Injectable()
export class ImageClassificationService {
  private readonly logger = new Logger(ImageClassificationService.name);
  private readonly visionBatchSize: number;

  constructor(private readonly azureOpenAiService: AzureOpenAiService) {
    const configured = Number(process.env.VISION_CLASSIFICATION_CONCURRENCY);
    this.visionBatchSize =
      Number.isFinite(configured) && configured > 0 ? configured : 16;
  }

  classifyByHeuristic(caption: string | null | undefined): ImageClassificationResult | null {
    const normalized = (caption ?? '').trim();
    if (!normalized) {
      return null;
    }

    if (DECORATIVE_CAPTION_PATTERNS.some((pattern) => pattern.test(normalized))) {
      return {
        isInstructional: false,
        description: normalized,
        source: 'heuristic',
      };
    }

    return null;
  }

  async classifyImage(params: {
    imageUrl: string;
    caption?: string | null;
  }): Promise<ImageClassificationResult> {
    const heuristic = this.classifyByHeuristic(params.caption);
    if (heuristic) {
      return heuristic;
    }

    try {
      const result = await this.invokeVisionWithRetry({
        imageUrl: params.imageUrl,
        caption: params.caption,
      });

      return {
        isInstructional: result.isInstructional,
        description: result.description,
        source: 'vision',
      };
    } catch (error) {
      this.logger.warn(
        `Vision classification failed, defaulting to non-instructional: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        isInstructional: true,
        description: params.caption?.trim() || 'Educational figure (classification unavailable)',
        source: 'heuristic',
      };
    }
  }

  async classifyImagesInBatches(
    images: Array<{ imageUrl: string; caption?: string | null }>,
    batchSize = this.visionBatchSize,
  ): Promise<ImageClassificationResult[]> {
    const results: ImageClassificationResult[] = [];

    for (let index = 0; index < images.length; index += batchSize) {
      const batch = images.slice(index, index + batchSize);
      const batchResults = await Promise.all(
        batch.map((image) =>
          this.classifyImage({
            imageUrl: image.imageUrl,
            caption: image.caption,
          }),
        ),
      );
      results.push(...batchResults);
    }

    return results;
  }

  private async invokeVisionWithRetry(params: {
    imageUrl: string;
    caption?: string | null;
  }): Promise<z.infer<typeof classificationSchema>> {
    const maxAttempts = 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.azureOpenAiService.invokeVisionJson({
          imageUrl: params.imageUrl,
          detail: 'low',
          systemPrompt:
            'You classify figures extracted from educational PDF documents. Respond with JSON only.',
          userText: [
            'Classify this figure.',
            params.caption
              ? `Document caption: ${params.caption}`
              : 'Document caption: none',
            '',
            'Set isInstructional=true for diagrams, charts, flowcharts, tables, labeled figures, process models, medical/educational illustrations, radiographs, X-rays, CT/MRI scans, ultrasounds, pathology slides, ECG strips, and other visuals needed to learn the material.',
            'Set isInstructional=false for stock photos, decorative photos of people, logos, icons alone, blank images, watermarks, and generic office/lifestyle photos.',
            'In description, briefly state what the image actually shows.',
          ].join('\n'),
          schema: classificationSchema,
        });
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
        }
      }
    }

    throw lastError;
  }

  async validateQuestionImageRelevance(params: {
    imageUrl: string;
    prompt: string;
    caption?: string | null;
    visionDescription?: string | null;
  }): Promise<ImageRelevanceResult> {
    try {
      const result = await this.azureOpenAiService.invokeVisionJson({
        imageUrl: params.imageUrl,
        detail: 'low',
        systemPrompt:
          'You validate whether an MCQ question matches its attached figure. Respond with JSON only.',
        userText: [
          `Question prompt: ${params.prompt}`,
          params.caption ? `Document caption: ${params.caption}` : null,
          params.visionDescription
            ? `Figure description: ${params.visionDescription}`
            : null,
          '',
          'Set isRelevant=true when the image is a radiograph, scan, diagram, or figure that a learner could reasonably identify or interpret to answer the question.',
          'Set isRelevant=true only if the image contains the specific visual information the question asks about.',
          'Set isRelevant=false if the image is decorative, unrelated, or does not show what the question references.',
        ]
          .filter(Boolean)
          .join('\n'),
        schema: relevanceSchema,
      });

      return result;
    } catch (error) {
      this.logger.warn(
        `Vision relevance validation failed, rejecting image pairing: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        isRelevant: true,
        reason: 'Validation unavailable; kept for image-identification question',
      };
    }
  }

  isInstructionalMetadata(metadata: Record<string, unknown> | null | undefined): boolean {
    if (!metadata || typeof metadata !== 'object') {
      return true;
    }

    return metadata.is_instructional !== false;
  }

  stripFigureReferences(prompt: string): string {
    return prompt
      .replace(/\brefer to the (figure|image|diagram|chart)\b[^.?!]*[.?!]?\s*/gi, '')
      .replace(/\b(as shown (in|above)|see the (figure|image|diagram|chart))\b[^.?!]*[.?!]?\s*/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  isImageIdentificationPrompt(prompt: string): boolean {
    return /\b(identify|what (is|does|abnormalit|patholog|condition|finding|fracture|diagnosis)|which (of the following )?(condition|finding|abnormality|diagnosis)|shown in (this|the) (image|radiograph|x-?ray|scan|figure|diagram)|in this (image|radiograph|x-?ray|scan|figure|diagram)|radiograph|radiology|x-?ray|ct scan|mri|ultrasound|ecg|ekg)\b/i.test(
      prompt,
    );
  }
}
