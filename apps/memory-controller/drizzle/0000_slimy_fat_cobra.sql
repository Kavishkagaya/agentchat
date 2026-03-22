CREATE TABLE `context_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role` text NOT NULL,
	`text` text NOT NULL,
	`tokens` integer NOT NULL,
	`agent_nickname` text,
	`sender_name` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `message_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_id` text NOT NULL,
	`event_type` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`message_id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`text` text NOT NULL,
	`agent_id` text,
	`sender_id` text,
	`sender_name` text,
	`agent_nickname` text,
	`tokens` integer,
	`created_at` text NOT NULL
);
