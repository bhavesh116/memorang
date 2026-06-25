import { Injectable } from '@nestjs/common';
import { AzureOpenAI } from 'openai';
import { AzureChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

@Injectable()
export class AzureOpenAiService {
  private readonly client: AzureOpenAI;
  private readonly chatClient: AzureOpenAI;
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
    this.chatClient = new AzureOpenAI({
      apiKey: this.apiKey,
      endpoint: this.endpoint,
      apiVersion: this.apiVersion,
      deployment: this.chatDeployment,
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
    const config: Record<string, unknown> = {
      azureOpenAIApiKey: this.apiKey,
      azureOpenAIEndpoint: this.endpoint,
      azureOpenAIApiDeploymentName: this.chatDeployment,
      azureOpenAIApiVersion: this.apiVersion,
      maxRetries: 1,
    };

    const explicitTemperature = process.env.AZURE_OPENAI_CHAT_TEMPERATURE;
    if (explicitTemperature !== undefined && explicitTemperature !== '') {
      config.temperature = Number(explicitTemperature);
    } else if (process.env.AZURE_OPENAI_CHAT_SUPPORTS_TEMPERATURE === 'true') {
      config.temperature = options?.temperature ?? 0.2;
    }

    return new AzureChatOpenAI(config);
  }

  async invokeVisionJson<T>(params: {
    imageUrl: string;
    systemPrompt: string;
    userText: string;
    schema: z.ZodType<T>;
    detail?: 'low' | 'high';
  }): Promise<T> {
    const response = await this.chatClient.chat.completions.create({
      model: this.chatDeployment,
      reasoning_effort: 'none',
      max_completion_tokens: 250,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: params.systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: params.userText },
            {
              type: 'image_url',
              image_url: {
                url: params.imageUrl,
                detail: params.detail ?? 'low',
              },
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? '{}';
    return params.schema.parse(JSON.parse(content));
  }
}
