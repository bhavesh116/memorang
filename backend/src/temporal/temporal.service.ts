import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Client, Connection } from '@temporalio/client';
import { DocumentIngestionWorkflowInput } from './types';

@Injectable()
export class TemporalService implements OnModuleDestroy {
  private readonly logger = new Logger(TemporalService.name);
  private connectionPromise?: Promise<Connection>;

  private get address(): string {
    return process.env.TEMPORAL_ADDRESS || 'localhost:7233';
  }

  private get namespace(): string {
    return process.env.TEMPORAL_NAMESPACE || 'default';
  }

  private get taskQueue(): string {
    return process.env.TEMPORAL_TASK_QUEUE || 'document-ingestion';
  }

  async terminateDocumentIngestionWorkflow(learningId: string): Promise<void> {
    const workflowId = `document-ingestion-${learningId}`;

    try {
      const client = new Client({
        connection: await this.getConnection(),
        namespace: this.namespace,
      });
      const handle = client.workflow.getHandle(workflowId);
      await handle.terminate('Ingestion restarted');
      this.logger.log(`Terminated workflow ${workflowId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('not found') ||
        message.includes('workflow not found') ||
        message.includes('WorkflowNotFound')
      ) {
        return;
      }

      this.logger.warn(
        `Could not terminate workflow ${workflowId}: ${message}`,
      );
    }
  }

  async startDocumentIngestionWorkflow(
    input: DocumentIngestionWorkflowInput,
  ): Promise<string> {
    const workflowId = `document-ingestion-${input.learningId}`;

    const client = new Client({
      connection: await this.getConnection(),
      namespace: this.namespace,
    });

    await client.workflow.start('documentIngestionWorkflow', {
      args: [input],
      taskQueue: this.taskQueue,
      workflowId,
    });

    return workflowId;
  }

  async onModuleDestroy() {
    if (!this.connectionPromise) {
      return;
    }

    const connection = await this.connectionPromise;
    await connection.close();
  }

  private async getConnection(): Promise<Connection> {
    if (!this.connectionPromise) {
      this.connectionPromise = Connection.connect({
        address: this.address,
      });
    }

    return this.connectionPromise;
  }
}
