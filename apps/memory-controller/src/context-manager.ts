export namespace ContextManager {
  export const DEFAULT_THRESHOLD = 50_000; // tokens before compaction

  export function estimateTokens(text: string): number {
    if (!text) return 0;
    const words = text.trim().split(/\s+/).length;
    return Math.ceil(words * 1.35) + 4;
  }

  export function insertContextMessage(
    sql: any,
    params: {
      role: string;
      text: string;
      tokens?: number;
    },
  ) {
    const tokens = params.tokens ?? estimateTokens(params.text);
    sql.exec(
      "INSERT INTO context_messages (role, text, tokens, created_at) VALUES (?1,?2,?3,?4)",
      params.role,
      params.text,
      tokens,
      new Date().toISOString(),
    );
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

  export function assembleContext(
    sql: any,
  ): Array<{ role: string; content: string }> {
    try {
      const rows = Array.from(
        sql.exec("SELECT role, text FROM context_messages ORDER BY id ASC"),
      ) as Array<{ role: string; text: string }>;

      return rows.map((row) => ({ role: row.role, content: row.text }));
    } catch (error) {
      console.error("assembleContext failed:", error);
      return [];
    }
  }

  export function maybeCompact(sql: any, threshold = DEFAULT_THRESHOLD) {
    const stats = Array.from(
      sql.exec("SELECT SUM(tokens) as total FROM context_messages"),
    ) as Array<{ total: number }>;
    const total = stats[0]?.total ?? 0;
    if (total < threshold) return;

    // TODO: Replace with LLM summarization call
    const rows = Array.from(
      sql.exec("SELECT text FROM context_messages ORDER BY id ASC"),
    ) as Array<{ text: string }>;
    const summaryText = `[SUMMARY]: ${rows.map((r) => r.text).join("\n")}`;
    const summaryTokens = estimateTokens(summaryText);

    sql.exec("DELETE FROM context_messages");
    insertContextMessage(sql, {
      role: "system",
      text: summaryText,
      tokens: summaryTokens,
    });

    console.log(`Context compacted at ${total} tokens.`);
  }
}
