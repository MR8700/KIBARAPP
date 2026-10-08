import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

/** Stockage S3-compatible avec repli automatique sur stockage local (disque) si S3 indisponible. */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private bucket = process.env.S3_BUCKET ?? 'kibar-private';
  private localDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
  private s3Available = false;

  private s3 = new S3Client({
    region: 'us-east-1', endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000', forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? 'kibar', secretAccessKey: process.env.S3_SECRET_KEY ?? 'kibar_dev_secret' },
  });
  private signer = new S3Client({
    region: 'us-east-1', endpoint: process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT ?? 'http://localhost:9000', forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? 'kibar', secretAccessKey: process.env.S3_SECRET_KEY ?? 'kibar_dev_secret' },
  });

  async onModuleInit() {
    try { mkdirSync(this.localDir, { recursive: true }); } catch { /* ignore */ }
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.s3Available = true;
      this.logger.log(`Stockage S3 (${this.bucket}) connecté et opérationnel.`);
    } catch {
      try {
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.s3Available = true;
        this.logger.log(`Bucket S3 (${this.bucket}) créé avec succès.`);
      } catch (err: any) {
        this.s3Available = false;
        this.logger.warn(`S3/MinIO non disponible (${err.message}) : utilisation du stockage local sur disque (${this.localDir}).`);
      }
    }
  }

  async put(key: string, body: Buffer, mime: string) {
    // 1. Sauvegarde locale sur disque
    try {
      const localPath = join(this.localDir, key);
      mkdirSync(dirname(localPath), { recursive: true });
      writeFileSync(localPath, body);
    } catch (e: any) {
      this.logger.error(`Erreur écriture disque local (${key}): ${e.message}`);
    }

    // 2. Si S3 est disponible, répliquer
    if (this.s3Available) {
      try {
        await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: mime, ContentDisposition: 'attachment' }));
      } catch (err: any) {
        this.logger.warn(`Échec réplication S3 (${key}): ${err.message}`);
      }
    }
    return { key };
  }

  /** Lecture complète (≤ 25 Mo, limite d'upload) pour l'analyse antivirus ou le téléchargement. */
  async get(key: string): Promise<Buffer> {
    const localPath = join(this.localDir, key);
    if (existsSync(localPath)) {
      return readFileSync(localPath);
    }
    const r = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }

  async remove(key: string) {
    const localPath = join(this.localDir, key);
    if (existsSync(localPath)) {
      try { unlinkSync(localPath); } catch { /* ignore */ }
    }
    if (this.s3Available) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })).catch(() => undefined);
    }
  }

  /** URL émise après contrôle d'autorisation : S3 presigned URL ou route API locale. */
  async signedUrl(key: string, name: string, inline: boolean, ttl?: number) {
    if (this.s3Available) {
      try {
        return await getSignedUrl(this.signer, new GetObjectCommand({
          Bucket: this.bucket, Key: key,
          ResponseContentDisposition: `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
        }), { expiresIn: ttl ?? (inline ? 300 : 60) });
      } catch {
        /* repli sur URL API locale */
      }
    }
    const base = process.env.API_ORIGIN || (process.env.NODE_ENV === 'production' ? 'https://kibar-api.onrender.com' : 'http://localhost:4000');
    return `${base}/public/r/files/${encodeURIComponent(key)}?name=${encodeURIComponent(name)}${inline ? '&inline=1' : ''}`;
  }

  async isHealthy(): Promise<boolean> {
    if (this.s3Available) return true;
    return existsSync(this.localDir);
  }
}

