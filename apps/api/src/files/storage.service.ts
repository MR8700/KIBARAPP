import { Injectable, OnModuleInit } from '@nestjs/common';
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Stockage S3-compatible (MinIO). Bucket privé : aucun accès direct, uniquement des URLs signées courtes. */
@Injectable()
export class StorageService implements OnModuleInit {
  private bucket = process.env.S3_BUCKET ?? 'kibar-private';
  private s3 = new S3Client({
    region: 'us-east-1', endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000', forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? 'kibar', secretAccessKey: process.env.S3_SECRET_KEY ?? 'kibar_dev_secret' },
  });
  /** Les URLs signées sont ouvertes par le navigateur de l'utilisateur : elles doivent pointer vers une adresse PUBLIQUE du stockage (S3_PUBLIC_ENDPOINT), pas vers l'adresse interne. */
  private signer = new S3Client({
    region: 'us-east-1', endpoint: process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT ?? 'http://localhost:9000', forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? 'kibar', secretAccessKey: process.env.S3_SECRET_KEY ?? 'kibar_dev_secret' },
  });
  async onModuleInit() {
    try { await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket })); }
    catch { await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket })).catch(() => undefined); }
  }
  put(key: string, body: Buffer, mime: string) {
    return this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: mime, ContentDisposition: 'attachment' }));
  }
  /** Lecture complète (≤ 25 Mo, limite d'upload) pour l'analyse antivirus. */
  async get(key: string): Promise<Buffer> {
    const r = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
  remove(key: string) { return this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })); }
  /** URL émise seulement après contrôle d'autorisation : 60 s en téléchargement, 5 min en affichage (lecture vidéo/PDF sans coupure). */
  signedUrl(key: string, name: string, inline: boolean, ttl?: number) {
    return getSignedUrl(this.signer, new GetObjectCommand({
      Bucket: this.bucket, Key: key,
      ResponseContentDisposition: `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
    }), { expiresIn: ttl ?? (inline ? 300 : 60) });
  }
  async isHealthy(): Promise<boolean> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }
}
