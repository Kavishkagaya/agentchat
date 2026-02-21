export interface Env {
  ENVIRONMENT: string;
  TEMPLATES_BUCKET: R2Bucket;
  ARCHIVES_BUCKET: R2Bucket;
  NEON_DATABASE_URL?: string;
  PREVIEW_JWT_SECRET?: string;
  AGENTS_BASE_URL?: string;
}
