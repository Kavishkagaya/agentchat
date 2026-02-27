export interface Env {
  AGENTS_BASE_URL?: string;
  ARCHIVES_BUCKET: R2Bucket;
  APP_PUBLIC_KEY: string;
  ENVIRONMENT: string;
  GC_PUBLIC_KEY: string;
  GC_SERVICE_TOKEN?: string;
  GROUP_AUTO_ARCHIVE_DAYS?: string;
  MAX_ACTIVE_GROUPS_PER_ORG?: string;

  // Durable Objects
  GROUP_CONTROLLER: DurableObjectNamespace;
  NEON_DATABASE_URL?: string;

  // Secrets
  ORCHESTRATOR_PRIVATE_KEY: string;
  ORCHESTRATOR_PUBLIC_KEY: string;
}
