export interface Env {
  ENVIRONMENT: string;
  ARCHIVES_BUCKET: R2Bucket;
  NEON_DATABASE_URL?: string;
  AGENTS_BASE_URL?: string;
  
  // Durable Objects
  GROUP_CONTROLLER: DurableObjectNamespace;

  // Secrets
  ORCHESTRATOR_PRIVATE_KEY: string;
  ORCHESTRATOR_PUBLIC_KEY: string;
}