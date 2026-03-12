import { resolveChatTargets } from "./decision-maker";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`decision-maker test failed: ${message}`);
  }
}

export function runDecisionMakerTests(): void {
  const baseConfig = {
    auto: true,
    default_agent: "agent_default",
    mention_map: {
      planner: "agent_planner",
      reviewer: "agent_reviewer",
    },
    agent_setups: [
      {
        agentId: "agent_planner",
        nickname: "planner",
        responsibility: "Plans execution",
      },
      {
        agentId: "agent_reviewer",
        nickname: "reviewer",
        responsibility: "Reviews quality",
      },
      {
        agentId: "agent_default",
        nickname: "default",
        responsibility: "Fallback",
      },
    ],
  };

  const mentionDecision = resolveChatTargets({
    config: baseConfig,
    text: "Please ask @planner to prepare a plan.",
    origin: "user",
    mentionRoutingEnabled: true,
  });
  assert(
    mentionDecision.source === "mention" &&
      mentionDecision.targetAgentIds.length === 1 &&
      mentionDecision.targetAgentIds[0] === "agent_planner",
    "mention should route to mapped agent"
  );

  const unknownMentionDecision = resolveChatTargets({
    config: baseConfig,
    text: "ping @unknown",
    origin: "user",
    mentionRoutingEnabled: true,
  });
  assert(
    unknownMentionDecision.source === "default" &&
      unknownMentionDecision.targetAgentIds[0] === "agent_default" &&
      unknownMentionDecision.unknownMentions.includes("unknown"),
    "unknown mention should emit warning and fallback to default"
  );

  const noMentionDecision = resolveChatTargets({
    config: baseConfig,
    text: "no mention in this message",
    origin: "user",
    mentionRoutingEnabled: true,
  });
  assert(
    noMentionDecision.source === "default" &&
      noMentionDecision.targetAgentIds[0] === "agent_default",
    "no mention should fallback to default when auto mode is enabled"
  );

  const agentOriginManualDecision = resolveChatTargets({
    config: { ...baseConfig, auto: false, default_agent: undefined },
    text: "handoff to @reviewer",
    origin: "agent",
    mentionRoutingEnabled: true,
  });
  assert(
    agentOriginManualDecision.targetAgentIds.length === 0,
    "agent-origin mentions must not chain when auto mode is disabled"
  );

  // Parity check: both WS/HTTP paths call this same resolver, so equivalent input must match.
  const parityWs = resolveChatTargets({
    config: baseConfig,
    text: "@reviewer check this",
    origin: "user",
    mentionRoutingEnabled: true,
  });
  const parityHttp = resolveChatTargets({
    config: baseConfig,
    text: "@reviewer check this",
    origin: "user",
    mentionRoutingEnabled: true,
  });
  assert(
    JSON.stringify(parityWs) === JSON.stringify(parityHttp),
    "ws/http equivalent inputs should produce identical routing decisions"
  );
}
