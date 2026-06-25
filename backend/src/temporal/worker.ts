import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NativeConnection, Worker } from '@temporalio/worker';
import { AppModule } from '../app.module';
import { DocumentActivities } from './activities/document.activities';

async function bootstrapWorker() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  const activities = app.get(DocumentActivities);
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
  });

  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    taskQueue: process.env.TEMPORAL_TASK_QUEUE || 'document-ingestion',
    workflowsPath: require.resolve('./workflows/document-ingestion.workflow'),
    activities: {
      initializeIngestion: activities.initializeIngestion.bind(activities),
      runDocumentIntelligence: activities.runDocumentIntelligence.bind(activities),
      extractAndClassifyFigures: activities.extractAndClassifyFigures.bind(activities),
      persistDocumentChunks: activities.persistDocumentChunks.bind(activities),
      embedDocumentChunks: activities.embedDocumentChunks.bind(activities),
      finalizeIngestion: activities.finalizeIngestion.bind(activities),
      failIngestion: activities.failIngestion.bind(activities),
    },
  });

  try {
    await worker.run();
  } finally {
    await app.close();
    await connection.close();
  }
}

bootstrapWorker().catch((error) => {
  console.error('Temporal worker failed to start', error);
  process.exit(1);
});
