import {
  normalizeChatRoutingConfig,
  resolveMessageTargets,
  type ChatRoutingConfig,
  type MessageOrigin,
  type MessageRoutingDecision,
} from "@axon/shared";

export type ChatRoutingContext = {
  config: Record<string, unknown> | null | undefined;
  text: string;
  explicitAgentIds?: string[];
  origin: MessageOrigin;
  mentionRoutingEnabled: boolean;
};

export type ChatRoutingResult = MessageRoutingDecision & {
  config: ChatRoutingConfig;
  routingEnabled: boolean;
};

export function getTriggerDepthLimit(config: ChatRoutingConfig): number {
  return Math.max(1, config.trigger_depth_limit ?? 2);
}

export function resolveChatTargets(input: ChatRoutingContext): ChatRoutingResult {
  const config = normalizeChatRoutingConfig(input.config);
  const routingEnabled = input.mentionRoutingEnabled && config.mention_routing_enabled !== false;

  if (!routingEnabled) {
    const fallbackTarget =
      config.auto === true && config.default_agent ? [config.default_agent] : [];
    return {
      config,
      routingEnabled: false,
      source: fallbackTarget.length > 0 ? "default" : "none",
      targetAgentIds: fallbackTarget,
      validMentions: [],
      unknownMentions: [],
    };
  }

  return {
    config,
    routingEnabled: true,
    ...resolveMessageTargets({
      text: input.text,
      explicitAgentIds: input.explicitAgentIds,
      origin: input.origin,
      config,
    }),
  };
}
