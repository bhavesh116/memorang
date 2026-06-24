import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { MessagesAnnotation } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { AzureOpenAiService } from '../azure-openai/azure-openai.service';

const ChatStateAnnotation = Annotation.Root({
  messages: MessagesAnnotation.spec.messages,
  systemPrompt: Annotation<string>(),
  learningId: Annotation<string>(),
});

type ChatState = typeof ChatStateAnnotation.State;

@Injectable()
export class LangGraphService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LangGraphService.name);
  private checkpointer: PostgresSaver | null = null;
  private graph: any = null;

  constructor(private readonly azureOpenAiService: AzureOpenAiService) {}

  async onModuleInit() {
    const connectionString = this.getConnectionString();
    this.checkpointer = PostgresSaver.fromConnString(connectionString, {
      schema: process.env.LANGGRAPH_POSTGRES_SCHEMA || 'public',
    });
    await this.checkpointer.setup();
    this.graph = this.buildGraph();
    this.logger.log('LangGraph checkpointer initialized');
  }

  async onModuleDestroy() {
    if (this.checkpointer) {
      await this.checkpointer.end();
    }
  }

  async streamConversation(params: {
    threadId: string;
    learningId: string;
    systemPrompt: string;
    message: string;
  }) {
    if (!this.graph) {
      throw new Error('LangGraph is not initialized');
    }

    return this.graph.streamEvents(
      {
        learningId: params.learningId,
        systemPrompt: params.systemPrompt,
        messages: [new HumanMessage(params.message)],
      },
      {
        version: 'v2',
        configurable: {
          thread_id: params.threadId,
        },
      },
    );
  }

  private buildGraph() {
    const model = this.azureOpenAiService.createChatModel({
      temperature: 0.2,
    });

    const graphBuilder = new StateGraph(ChatStateAnnotation)
      .addNode('assistant', async (state: ChatState) => {
        const messages: BaseMessage[] = [
          new SystemMessage(state.systemPrompt),
          ...state.messages,
        ];
        const response = await model.invoke(messages);
        return {
          messages: [response],
        };
      })
      .addEdge(START, 'assistant')
      .addEdge('assistant', END);

    return graphBuilder.compile({
      checkpointer: this.checkpointer ?? undefined,
    });
  }

  private getConnectionString(): string {
    const explicit = process.env.LANGGRAPH_POSTGRES_URL;
    if (explicit) {
      return explicit;
    }

    throw new Error(
      'Missing LANGGRAPH_POSTGRES_URL environment variable for LangGraph persistence.',
    );
  }
}
