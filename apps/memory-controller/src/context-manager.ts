import { asc, sql, sum } from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import * as schema from "./schema";

export class ContextManager {
  static readonly DEFAULT_THRESHOLD = 50_000; // tokens before compaction

  constructor(private db: DrizzleSqliteDODatabase<typeof schema>) {}

  static estimateTokens(text: string): number {
    if (!text) return 0;
    const words = text.trim().split(/\s+/).length;
    return Math.ceil(words * 1.35) + 4;
  }

  insertContextMessage(params: schema.ContextMessageInsert): void {
    const tokens = params.tokens ?? ContextManager.estimateTokens(params.text);
    this.db
      .insert(schema.contextMessages)
      .values({
        ...params,
        tokens,
        agent_nickname: params.agent_nickname ?? null,
        sender_name: params.sender_name ?? null,
        created_at: params.created_at ?? new Date().toISOString(),
      })
      .run();
  }

  assembleContext(agentNickname?: string): Array<{ role: string; content: string; name?: string }> {
    try {
      return this.db
        .select({
          role: schema.contextMessages.role,
          text: schema.contextMessages.text,
          agent_nickname: schema.contextMessages.agent_nickname,
          sender_name: schema.contextMessages.sender_name,
        })
        .from(schema.contextMessages)
        .orderBy(asc(schema.contextMessages.id))
        .all()
        .map((row: { role: string; text: string; agent_nickname: string | null; sender_name: string | null }) => {
          // Preserve system role — compaction summaries must not become "user"
          if (row.role === "system") {
            return { role: "system", content: row.text };
          }

          let role: string;
          if (agentNickname && row.agent_nickname === agentNickname) {
            role = "assistant";
          } else {
            role = "user";
          }

          // Use agent_nickname for agents, sender_name for humans
          const name = row.agent_nickname ?? row.sender_name ?? undefined;

          return { role, content: row.text, ...(name ? { name } : {}) };
        });
    } catch (error) {
      console.error("assembleContext failed:", error);
      return [];
    }
  }

  maybeCompact(threshold = ContextManager.DEFAULT_THRESHOLD): void {
    const [{ total }] = this.db
      .select({ total: sum(schema.contextMessages.tokens) })
      .from(schema.contextMessages)
      .all();

    const totalTokens = Number(total ?? 0);
    if (totalTokens < threshold) return;

    const rows = this.db
      .select({ text: schema.contextMessages.text })
      .from(schema.contextMessages)
      .orderBy(asc(schema.contextMessages.id))
      .all();

    const summaryText = `[SUMMARY]: ${rows.map((r: { text: string }) => r.text).join("\n")}`;
    const summaryTokens = ContextManager.estimateTokens(summaryText);

    // Insert summary FIRST — if this throws, existing rows are untouched
    const result = this.db
      .insert(schema.contextMessages)
      .values({
        role: "system",
        text: summaryText,
        tokens: summaryTokens,
        created_at: new Date().toISOString(),
      })
      .returning({ id: schema.contextMessages.id })
      .get();

    if (!result?.id || typeof result.id !== "number") {
      console.error("Failed to insert summary message");
      return;
    }

    // Delete everything older than the summary we just inserted
    const summaryId: number = result.id;
    this.db.delete(schema.contextMessages).where(sql`id < ${summaryId}`).run();

    console.log(`Context compacted at ${totalTokens} tokens.`);
  }
}

export class ContextBuilder {
  private message_array: Array<{ role: string; content: string }> = [];

  system(prompt: string): this {
    this.message_array.push({ role: "system", content: prompt });
    return this;
  }

  message(msg: { role: string; content: string }): this {
    this.message_array.push(msg);
    return this;
  }

  messages(msgs: Array<{ role: string; content: string }>): this {
    this.message_array.push(...msgs);
    return this;
  }

  build(): Array<{ role: string; content: string }> {
    return this.message_array;
  }
}

export function builder(): ContextBuilder {
  return new ContextBuilder();
}
