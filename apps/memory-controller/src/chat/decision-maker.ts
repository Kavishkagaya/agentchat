import {
  type ChatRoutingConfig,
  type MessageOrigin,
  type MessageRoutingDecision,
  normalizeChatRoutingConfig,
  resolveMessageTargets,
} from "@axon/shared";

export type ChatRoutingContext = {
  config: Record<string, unknown> | null | undefined;
  text: string;
  explicitAgentIds?: string[];
  origin: MessageOrigin;
};

export type ChatRoutingResult = MessageRoutingDecision & {
  config: ChatRoutingConfig;
};

export function getTriggerDepthLimit(config: ChatRoutingConfig): number {
  return Math.max(1, config.trigger_depth_limit ?? 2);
}

export function resolveChatTargets(
  input: ChatRoutingContext,
): ChatRoutingResult {
  const config = normalizeChatRoutingConfig(input.config);

  return {
    config,
    ...resolveMessageTargets({
      text: input.text,
      explicitAgentIds: input.explicitAgentIds,
      origin: input.origin,
      config,
    }),
  };
}
