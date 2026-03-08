export interface Env {
  AGENTS_BASE_URL?: string;
  APP_PUBLIC_KEY: string;
  ARCHIVES_BUCKET: R2Bucket;
  ENVIRONMENT: string;
  GC_PUBLIC_KEY: string;
  GC_SERVICE_TOKEN?: string;
  GROUP_AUTO_ARCHIVE_DAYS?: string;

  // Durable Objects
  MEMORY_CONTROLLER: DurableObjectNamespace;
  MAX_ACTIVE_GROUPS_PER_ORG?: string;
  NEON_DATABASE_URL?: string;

  // Secrets
  ORCHESTRATOR_PRIVATE_KEY: string;
  ORCHESTRATOR_PUBLIC_KEY: string;
}
