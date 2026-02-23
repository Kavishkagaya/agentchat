CREATE TABLE "agent_runtimes" (
	"runtime_id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"status" text NOT NULL,
	"base_url" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"agent_id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"config" jsonb NOT NULL,
	"visibility" text NOT NULL,
	"created_by" text,
	"parent_agent_id" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"audit_id" text PRIMARY KEY NOT NULL,
	"org_id" text,
	"actor_user_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_agent_runtimes" (
	"group_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"runtime_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_agents" (
	"group_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"added_by" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_archives" (
	"archive_id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"snapshot_id" text NOT NULL,
	"r2_path" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"added_by" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_runtime" (
	"group_id" text PRIMARY KEY NOT NULL,
	"group_controller_id" text NOT NULL,
	"status" text NOT NULL,
	"last_active_at" timestamp with time zone,
	"idle_at" timestamp with time zone,
	"region" text,
	"public_key" text,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_secrets" (
	"group_id" text NOT NULL,
	"secret_id" text NOT NULL,
	"granted_by" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_snapshots" (
	"snapshot_id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"r2_path" text NOT NULL,
	"size_bytes" integer,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_tasks" (
	"task_id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"task_type" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"group_id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"agent_policy" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"last_active_at" timestamp with time zone,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "org_limits" (
	"org_id" text PRIMARY KEY NOT NULL,
	"max_storage_gb" integer,
	"max_egress_gb" integer
);
--> statement-breakpoint
CREATE TABLE "org_members" (
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_usage" (
	"org_id" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"concurrent_groups_peak" integer
);
--> statement-breakpoint
CREATE TABLE "orgs" (
	"org_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"plan_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secrets" (
	"secret_id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"namespace" text NOT NULL,
	"ciphertext" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"rotated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"org_id" text PRIMARY KEY NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
