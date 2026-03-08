-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text,
	"actor_user_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"config" jsonb NOT NULL,
	"visibility" text NOT NULL,
	"created_by" text,
	"parent_agent_id" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"model_id" text
);
--> statement-breakpoint
CREATE TABLE "agent_runtimes" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"status" text NOT NULL,
	"base_url" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
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
CREATE TABLE "groups" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"agent_policy" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"last_active_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"config" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"r2_path" text NOT NULL,
	"size_bytes" integer,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_members" (
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"clerk_org_id" text,
	"clerk_user_id" text
);
--> statement-breakpoint
CREATE TABLE "group_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"task_type" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_limits" (
	"org_id" text PRIMARY KEY NOT NULL,
	"max_storage_gb" integer,
	"max_egress_gb" integer
);
--> statement-breakpoint
CREATE TABLE "group_archives" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"snapshot_id" text NOT NULL,
	"r2_path" text NOT NULL,
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
CREATE TABLE "secrets" (
	"secret_id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"namespace" text NOT NULL,
	"ciphertext" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"rotated_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"plan_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"clerk_id" text NOT NULL
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
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"image_url" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"clerk_id" text NOT NULL,
	"password" text,
	"role" text DEFAULT 'user' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_servers" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"token" text NOT NULL,
	"secret_ref" text,
	"config" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"last_validated_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_configs" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"model_type" text NOT NULL,
	"kind" text NOT NULL,
	"model_id" text NOT NULL,
	"secret_ref" text NOT NULL,
	"gateway_account_id" text NOT NULL,
	"gateway_id" text NOT NULL,
	"config" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_agents" (
	"group_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"added_by" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "group_agents_group_id_agent_id_pk" PRIMARY KEY("group_id","agent_id")
);
--> statement-breakpoint
CREATE TABLE "group_secrets" (
	"group_id" text NOT NULL,
	"secret_id" text NOT NULL,
	"granted_by" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "group_secrets_group_id_secret_id_pk" PRIMARY KEY("group_id","secret_id")
);
--> statement-breakpoint
CREATE TABLE "group_agent_runtimes" (
	"group_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"runtime_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "group_agent_runtimes_group_id_agent_id_runtime_id_pk" PRIMARY KEY("group_id","agent_id","runtime_id")
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"added_by" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runtimes" ADD CONSTRAINT "agent_runtimes_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runtimes" ADD CONSTRAINT "agent_runtimes_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_runtime" ADD CONSTRAINT "group_runtime_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_snapshots" ADD CONSTRAINT "group_snapshots_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_tasks" ADD CONSTRAINT "group_tasks_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_limits" ADD CONSTRAINT "org_limits_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_archives" ADD CONSTRAINT "group_archives_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_usage" ADD CONSTRAINT "org_usage_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_catalog" ADD CONSTRAINT "model_catalog_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_catalog" ADD CONSTRAINT "model_catalog_secret_ref_secrets_secret_id_fk" FOREIGN KEY ("secret_ref") REFERENCES "public"."secrets"("secret_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_catalog" ADD CONSTRAINT "model_catalog_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_agents" ADD CONSTRAINT "group_agents_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_agents" ADD CONSTRAINT "group_agents_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_agents" ADD CONSTRAINT "group_agents_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_secrets" ADD CONSTRAINT "group_secrets_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_secrets" ADD CONSTRAINT "group_secrets_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_secrets" ADD CONSTRAINT "group_secrets_secret_id_secrets_secret_id_fk" FOREIGN KEY ("secret_id") REFERENCES "public"."secrets"("secret_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_agent_runtimes" ADD CONSTRAINT "group_agent_runtimes_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_agent_runtimes" ADD CONSTRAINT "group_agent_runtimes_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_agent_runtimes" ADD CONSTRAINT "group_agent_runtimes_runtime_id_agent_runtimes_id_fk" FOREIGN KEY ("runtime_id") REFERENCES "public"."agent_runtimes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_actor_user_id_idx" ON "audit_log" USING btree ("actor_user_id" text_ops);--> statement-breakpoint
CREATE INDEX "audit_log_org_id_idx" ON "audit_log" USING btree ("org_id" text_ops);--> statement-breakpoint
CREATE INDEX "agents_org_id_idx" ON "agents" USING btree ("org_id" text_ops);--> statement-breakpoint
CREATE INDEX "agent_runtimes_group_id_idx" ON "agent_runtimes" USING btree ("group_id" text_ops);--> statement-breakpoint
CREATE INDEX "groups_org_id_idx" ON "groups" USING btree ("org_id" text_ops);--> statement-breakpoint
CREATE INDEX "group_snapshots_group_id_idx" ON "group_snapshots" USING btree ("group_id" text_ops);--> statement-breakpoint
CREATE INDEX "org_members_clerk_org_id_idx" ON "org_members" USING btree ("clerk_org_id" text_ops);--> statement-breakpoint
CREATE INDEX "org_members_clerk_user_id_idx" ON "org_members" USING btree ("clerk_user_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "org_members_org_user_idx" ON "org_members" USING btree ("org_id" text_ops,"user_id" text_ops);--> statement-breakpoint
CREATE INDEX "org_members_user_id_idx" ON "org_members" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "group_tasks_group_id_idx" ON "group_tasks" USING btree ("group_id" text_ops);--> statement-breakpoint
CREATE INDEX "group_archives_group_id_idx" ON "group_archives" USING btree ("group_id" text_ops);--> statement-breakpoint
CREATE INDEX "org_usage_org_id_idx" ON "org_usage" USING btree ("org_id" text_ops);--> statement-breakpoint
CREATE INDEX "secrets_org_id_id_idx" ON "secrets" USING btree ("org_id" text_ops,"secret_id" text_ops);--> statement-breakpoint
CREATE INDEX "secrets_org_id_idx" ON "secrets" USING btree ("org_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "orgs_clerk_id_idx" ON "orgs" USING btree ("clerk_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "users_clerk_id_idx" ON "users" USING btree ("clerk_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email" text_ops);--> statement-breakpoint
CREATE INDEX "mcp_servers_org_id_idx" ON "mcp_servers" USING btree ("org_id" text_ops);--> statement-breakpoint
CREATE INDEX "mcp_servers_status_idx" ON "mcp_servers" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "model_catalog_model_type_idx" ON "model_catalog" USING btree ("model_type" text_ops);--> statement-breakpoint
CREATE INDEX "model_catalog_org_id_idx" ON "model_catalog" USING btree ("org_id" text_ops);--> statement-breakpoint
CREATE INDEX "group_members_user_id_idx" ON "group_members" USING btree ("user_id" text_ops);
*/