import {
  Injectable,
  OnModuleInit,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  ContainerClient,
} from '@azure/storage-blob';

@Injectable()
export class AzureService implements OnModuleInit {
  private readonly logger = new Logger(AzureService.name);
  private pdfContainerClient!: ContainerClient;
  private imageContainerClient!: ContainerClient;
  private sharedKeyCredential!: StorageSharedKeyCredential;
  private accountName!: string;
  private pdfContainerName!: string;
  private imageContainerName!: string;

  onModuleInit() {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    this.pdfContainerName =
      process.env.AZURE_STORAGE_PDF_CONTAINER || 'pdfs';
    this.imageContainerName =
      process.env.AZURE_STORAGE_IMAGE_CONTAINER || 'extracted-images';

    if (!connectionString) {
      throw new Error('Missing AZURE_STORAGE_CONNECTION_STRING env variable.');
    }

    const { accountName, accountKey } =
      this.parseConnectionString(connectionString);
    this.accountName = accountName;
    this.sharedKeyCredential = new StorageSharedKeyCredential(
      accountName,
      accountKey,
    );

    const blobServiceClient =
      BlobServiceClient.fromConnectionString(connectionString);
    this.pdfContainerClient = blobServiceClient.getContainerClient(
      this.pdfContainerName,
    );
    this.imageContainerClient = blobServiceClient.getContainerClient(
      this.imageContainerName,
    );

    // Ensure the containers exist (async, best-effort on init)
    this.pdfContainerClient
      .createIfNotExists()
      .then(() => this.logger.log(`Azure container "${this.pdfContainerName}" ready`))
      .catch((err) => this.logger.error('Azure pdf container init failed', err));

    this.imageContainerClient
      .createIfNotExists()
      .then(() => this.logger.log(`Azure container "${this.imageContainerName}" ready`))
      .catch((err) => this.logger.error('Azure image container init failed', err));
  }

  // ── Upload ──────────────────────────────────────────────────────────────────

  async uploadPdf(
    userId: string,
    learningId: string,
    originalName: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ blobName: string; sasUrl: string }> {
    const safeFileName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const blobName = `pdfs/${userId}/${learningId}/${Date.now()}_${safeFileName}`;

    try {
      const blockBlobClient =
        this.pdfContainerClient.getBlockBlobClient(blobName);
      await blockBlobClient.uploadData(buffer, {
        blobHTTPHeaders: {
          blobContentType: mimeType || 'application/pdf',
        },
      });
    } catch (err) {
      this.logger.error('Azure upload failed', err);
      throw new InternalServerErrorException('Failed to upload file to storage');
    }

    const sasUrl = this.generateSasUrl(this.pdfContainerName, blobName);
    return { blobName, sasUrl };
  }

  // ── Image Upload ────────────────────────────────────────────────────────────

  async uploadImage(
    userId: string,
    learningId: string,
    originalName: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ blobName: string; sasUrl: string }> {
    const safeFileName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const blobName = `images/${userId}/${learningId}/${Date.now()}_${safeFileName}`;

    try {
      const blockBlobClient =
        this.imageContainerClient.getBlockBlobClient(blobName);
      await blockBlobClient.uploadData(buffer, {
        blobHTTPHeaders: {
          blobContentType: mimeType || 'image/jpeg',
        },
      });
    } catch (err) {
      this.logger.error('Azure image upload failed', err);
      throw new InternalServerErrorException('Failed to upload image to storage');
    }

    const sasUrl = this.generateSasUrl(this.imageContainerName, blobName);
    return { blobName, sasUrl };
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async deletePdf(blobName: string): Promise<void> {
    try {
      const blockBlobClient =
        this.pdfContainerClient.getBlockBlobClient(blobName);
      await blockBlobClient.deleteIfExists();
    } catch (err) {
      // Non-fatal — log and continue
      this.logger.warn(`Failed to delete blob ${blobName}`, err);
    }
  }

  async deleteImage(blobName: string): Promise<void> {
    try {
      const blockBlobClient =
        this.imageContainerClient.getBlockBlobClient(blobName);
      await blockBlobClient.deleteIfExists();
    } catch (err) {
      this.logger.warn(`Failed to delete image blob ${blobName}`, err);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private parseConnectionString(connStr: string): {
    accountName: string;
    accountKey: string;
  } {
    const parts = connStr.split(';');
    const accountName =
      parts
        .find((p) => p.startsWith('AccountName='))
        ?.slice('AccountName='.length) ?? '';
    const accountKeyPart =
      parts.find((p) => p.startsWith('AccountKey=')) ?? '';
    // AccountKey may end with '=' (base64 padding) — preserve it
    const accountKey = accountKeyPart.slice('AccountKey='.length);
    return { accountName, accountKey };
  }

  private generateSasUrl(containerName: string, blobName: string): string {
    const expiresOn = new Date();
    expiresOn.setFullYear(expiresOn.getFullYear() + 1);

    const sasParams = generateBlobSASQueryParameters(
      {
        containerName,
        blobName,
        permissions: BlobSASPermissions.parse('r'),
        expiresOn,
      },
      this.sharedKeyCredential,
    );

    return `https://${this.accountName}.blob.core.windows.net/${containerName}/${blobName}?${sasParams.toString()}`;
  }
}
