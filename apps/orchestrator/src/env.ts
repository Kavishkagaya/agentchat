export interface Env {
  AGENTS_BASE_URL?: string;
  ARCHIVES_BUCKET: R2Bucket;
  ENVIRONMENT: string;

  // Durable Objects
  GROUP_CONTROLLER: DurableObjectNamespace;
  NEON_DATABASE_URL?: string;

  // Secrets
  ORCHESTRATOR_PRIVATE_KEY: string;
  ORCHESTRATOR_PUBLIC_KEY: string;
}
