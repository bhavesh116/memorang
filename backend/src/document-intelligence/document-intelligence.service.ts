import { Injectable, Logger } from '@nestjs/common';

export interface DocumentFigure {
  id: string;
  caption?: {
    content?: string;
  };
  boundingRegions?: Array<{
    pageNumber?: number;
  }>;
}

export interface DocumentParagraph {
  content?: string;
  role?: string;
  boundingRegions?: Array<{
    pageNumber?: number;
  }>;
}

export interface DocumentAnalysisResult {
  content?: string;
  paragraphs?: DocumentParagraph[];
  pages?: Array<{ pageNumber?: number }>;
  figures?: DocumentFigure[];
}

export interface DocumentAnalysisProgress {
  attempt: number;
  maxAttempts: number;
  elapsedMs: number;
}

@Injectable()
export class DocumentIntelligenceService {
  private readonly logger = new Logger(DocumentIntelligenceService.name);
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly apiVersion: string;

  constructor() {
    this.endpoint = (process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT || '').replace(
      /\/$/,
      '',
    );
    this.apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY || '';
    this.apiVersion =
      process.env.AZURE_DOCUMENT_INTELLIGENCE_API_VERSION || '2024-11-30';

    if (!this.endpoint || !this.apiKey) {
      throw new Error(
        'Missing Azure Document Intelligence configuration. Set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_KEY.',
      );
    }
  }

  async analyzePdfFromUrl(
    pdfUrl: string,
    onProgress?: (progress: DocumentAnalysisProgress) => void | Promise<void>,
  ): Promise<{
    operationLocation: string;
    result: DocumentAnalysisResult;
  }> {
    const analyzeUrl =
      `${this.endpoint}/documentintelligence/documentModels/prebuilt-layout:analyze` +
      `?api-version=${this.apiVersion}&output=figures&outputContentFormat=markdown`;

    const response = await fetch(
      analyzeUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Ocp-Apim-Subscription-Key': this.apiKey,
        },
        body: JSON.stringify({
          urlSource: pdfUrl,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Document Intelligence analyze request failed: ${errorText}`);
    }

    const operationLocation = response.headers.get('operation-location');

    if (!operationLocation) {
      throw new Error('Document Intelligence did not return operation-location');
    }

    this.logger.log(`Started layout analysis with figure output for ${pdfUrl}`);
    const result = await this.pollForResult(operationLocation, onProgress);
    this.logger.log(
      `Layout analysis completed with ${result.pages?.length ?? 0} pages and ${result.figures?.length ?? 0} figures`,
    );
    return { operationLocation, result };
  }

  async downloadFigure(
    operationLocation: string,
    figureId: string,
  ): Promise<Buffer | null> {
    const figureUrl = this.buildFigureUrl(operationLocation, figureId);
    const response = await fetch(figureUrl, {
      headers: {
        'Ocp-Apim-Subscription-Key': this.apiKey,
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Figure download failed for ${figureId}: ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private async pollForResult(
    operationLocation: string,
    onProgress?: (progress: DocumentAnalysisProgress) => void | Promise<void>,
  ): Promise<DocumentAnalysisResult> {
    const pollIntervalMs = 5000;
    const maxAttempts = 360;
    const startedAt = Date.now();

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (onProgress) {
        await onProgress({
          attempt,
          maxAttempts,
          elapsedMs: Date.now() - startedAt,
        });
      }

      const response = await fetch(operationLocation, {
        headers: {
          'Ocp-Apim-Subscription-Key': this.apiKey,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Document Intelligence poll failed: ${errorText}`);
      }

      const body = (await response.json()) as {
        status?: string;
        analyzeResult?: DocumentAnalysisResult;
      };

      if (body.status === 'succeeded') {
        return body.analyzeResult ?? {};
      }

      if (body.status === 'failed') {
        throw new Error('Document Intelligence analysis failed');
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error('Document Intelligence analysis timed out');
  }

  private buildFigureUrl(operationLocation: string, figureId: string): string {
    const [baseUrl, query = ''] = operationLocation.split('?');
    const url = `${baseUrl}/figures/${encodeURIComponent(figureId)}`;
    return query ? `${url}?${query}` : url;
  }
}
