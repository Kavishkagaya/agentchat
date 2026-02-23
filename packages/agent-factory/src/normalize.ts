import type { AgentConfig } from "./types";

export function normalizeAgentConfig(
  agentId: string,
  raw: Record<string, unknown>
): AgentConfig {
  const systemPrompt =
    (raw.systemPrompt as string | undefined) ??
    (raw.system_prompt as string | undefined);
  const model = (raw.model as string | undefined) ?? "gpt-4o-mini";
  const provider = (raw.provider as string | undefined) ?? "openai";
  return {
    agent_id: agentId,
    provider,
    model,
    system_prompt: systemPrompt,
    tools: raw.tools as AgentConfig["tools"],
    temperature: raw.temperature as number | undefined,
    max_tokens:
      (raw.maxTokens as number | undefined) ??
      (raw.max_tokens as number | undefined),
    top_p:
      (raw.topP as number | undefined) ?? (raw.top_p as number | undefined),
    presence_penalty:
      (raw.presencePenalty as number | undefined) ??
      (raw.presence_penalty as number | undefined),
    frequency_penalty:
      (raw.frequencyPenalty as number | undefined) ??
      (raw.frequency_penalty as number | undefined),
    stop: raw.stop as string[] | undefined,
    seed: raw.seed as number | undefined,
  };
}
