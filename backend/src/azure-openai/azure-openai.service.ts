import { Injectable } from '@nestjs/common';
import { AzureOpenAI } from 'openai';
import { AzureChatOpenAI } from '@langchain/openai';

@Injectable()
export class AzureOpenAiService {
  private readonly client: AzureOpenAI;
  private readonly embeddingDeployment: string;
  private readonly chatDeployment: string;
  private readonly endpoint: string;
  private readonly apiVersion: string;
  private readonly apiKey: string;

  constructor() {
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiVersion =
      process.env.AZURE_OPENAI_API_VERSION || '2024-10-21';
    this.embeddingDeployment =
      process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME || '';
    this.chatDeployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || '';
    this.endpoint = endpoint?.replace(/\/$/, '') || '';
    this.apiVersion = apiVersion;
    this.apiKey = apiKey || '';

    if (!apiKey || !endpoint || !this.embeddingDeployment || !this.chatDeployment) {
      throw new Error(
        'Missing Azure OpenAI configuration. Set AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT_NAME, and AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME.',
      );
    }

    this.client = new AzureOpenAI({
      apiKey: this.apiKey,
      endpoint: this.endpoint,
      apiVersion: this.apiVersion,
      deployment: this.embeddingDeployment,
    });
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const response = await this.client.embeddings.create({
      model: this.embeddingDeployment,
      input: texts,
      dimensions: 1536,
    });

    return response.data.map((item) => item.embedding);
  }

  async embedQuery(text: string): Promise<number[]> {
    const [embedding] = await this.embedTexts([text]);
    return embedding;
  }

  createChatModel(options?: { temperature?: number }) {
    return new AzureChatOpenAI({
      azureOpenAIApiKey: this.apiKey,
      azureOpenAIEndpoint: this.endpoint,
      azureOpenAIApiDeploymentName: this.chatDeployment,
      azureOpenAIApiVersion: this.apiVersion,
      temperature: options?.temperature ?? 0.2,
      maxRetries: 1,
    });
  }
}
