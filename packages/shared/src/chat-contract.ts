import { z } from "zod";

export const historyModeSchema = z.enum(["internal", "external"]);
export type HistoryMode = z.infer<typeof historyModeSchema>;

export const chatTopologySchema = z.enum(["chat", "workflow"]);
export type ChatTopology = z.infer<typeof chatTopologySchema>;

export const chatAgentSetupSchema = z.object({
  agentId: z.string().min(1),
  nickname: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
  responsibility: z.string().trim().min(3).max(300),
});
export type ChatAgentSetup = z.infer<typeof chatAgentSetupSchema>;

const chatRoutingConfigBaseSchema = z.object({
  topology: chatTopologySchema.default("chat"),
  history_mode: historyModeSchema.default("internal"),
  auto: z.boolean().default(true),
  default_agent: z.string().optional(),
  system_prompt: z.string().trim().min(1).optional(),
  compaction_threshold: z.number().int().min(10).max(1000).default(50),
  trigger_depth_limit: z.number().int().min(1).max(100).default(10),
  mention_routing_enabled: z.boolean().default(true),
  mention_map: z.record(z.string(), z.string()).default({}),
  agent_setups: z.array(chatAgentSetupSchema).default([]),
});

export const chatRoutingConfigSchema = chatRoutingConfigBaseSchema
  .passthrough()
  .superRefine((config, ctx) => {
    const seenAgentIds = new Set<string>();
    const seenNicknames = new Set<string>();
    const selectedAgentIds = new Set<string>();
    for (const setup of config.agent_setups) {
      if (seenAgentIds.has(setup.agentId)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate agent setup for agent: ${setup.agentId}`,
          path: ["agent_setups"],
        });
      }
      seenAgentIds.add(setup.agentId);
      selectedAgentIds.add(setup.agentId);

      const normalizedNickname = normalizeNickname(setup.nickname);
      if (seenNicknames.has(normalizedNickname)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate nickname: ${setup.nickname}`,
          path: ["agent_setups"],
        });
      }
      seenNicknames.add(normalizedNickname);
    }

    if (
      config.default_agent &&
      selectedAgentIds.size > 0 &&
      !selectedAgentIds.has(config.default_agent)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "default_agent must reference one of the selected agents",
        path: ["default_agent"],
      });
    }
  });

export type ChatRoutingConfig = z.infer<typeof chatRoutingConfigSchema>;

export const chatConfigPatchSchema = chatRoutingConfigBaseSchema
  .partial()
  .passthrough();
export type ChatConfigPatch = z.infer<typeof chatConfigPatchSchema>;

export const chatCreateInputSchema = z.object({
  title: z.string().trim().min(1).max(255),
  agentSetup: z.array(chatAgentSetupSchema).min(1),
  config: chatConfigPatchSchema.optional(),
});
export type ChatCreateInput = z.infer<typeof chatCreateInputSchema>;

export const chatUpdateInputSchema = z.object({
  chatId: z.string(),
  title: z.string().trim().min(1).max(255).optional(),
  agentSetup: z.array(chatAgentSetupSchema).optional(),
  config: chatConfigPatchSchema.optional(),
});
export type ChatUpdateInput = z.infer<typeof chatUpdateInputSchema>;

export const chatMessageRequestSchema = z.object({
  type: z.literal("message"),
  text: z.string().min(1),
  agent_ids: z.array(z.string()).optional(),
  sender_id: z.string().optional(),
  sender_name: z.string().optional(),
  message_id: z.string().optional(),
  origin: z.enum(["user", "agent"]).optional(),
  origin_agent_id: z.string().optional(),
});
export type ChatMessageRequest = z.infer<typeof chatMessageRequestSchema>;

export type ChatActivateRequestPayload = {
  config_id: string;
  history_mode?: HistoryMode;
  org_id: string;
  user_id?: string;
};

export type RoutingTokenRequestPayload = {
  config_id: string;
  user_id: string;
  role?: string;
};

export type MessageOrigin = "user" | "agent";

export type MessageRoutingInput = {
  text: string;
  explicitAgentIds?: string[];
  origin: MessageOrigin;
  config: ChatRoutingConfig;
};

export type MessageRoutingDecision = {
  targetAgentIds: string[];
  source: "explicit" | "mention" | "default" | "none";
  validMentions: string[];
  unknownMentions: string[];
};

export function normalizeNickname(nickname: string): string {
  return nickname.trim().toLowerCase();
}

export function buildMentionMap(agentSetup: ChatAgentSetup[]): Record<string, string> {
  const mentionMap: Record<string, string> = {};
  for (const setup of agentSetup) {
    mentionMap[normalizeNickname(setup.nickname)] = setup.agentId;
  }
  return mentionMap;
}

export function buildDefaultSystemPrompt(agentSetup: ChatAgentSetup[]): string {
  const lines: string[] = [];
  lines.push("You are collaborating in a multi-agent chat.");
  lines.push("Team members and responsibilities:");
  for (const setup of agentSetup) {
    lines.push(
      `- @${normalizeNickname(setup.nickname)} (${setup.agentId}): ${setup.responsibility}`
    );
  }
  lines.push("When another agent should take ownership, mention them with @nickname.");
  lines.push(
    "Only mention agents when necessary. Keep responses concise, actionable, and role-aligned."
  );
  return lines.join("\n");
}

function extractMentions(text: string): string[] {
  const mentions = new Set<string>();
  const regex = /(^|[\s.,;:!?()[\]{}"'`])@([a-zA-Z][a-zA-Z0-9_-]*)/g;
  let match: RegExpExecArray | null = regex.exec(text);
  while (match) {
    mentions.add(normalizeNickname(match[2] ?? ""));
    match = regex.exec(text);
  }
  return Array.from(mentions);
}

export function resolveMessageTargets(input: MessageRoutingInput): MessageRoutingDecision {
  const explicitAgentIds = Array.isArray(input.explicitAgentIds)
    ? Array.from(new Set(input.explicitAgentIds.filter(Boolean)))
    : [];

  if (explicitAgentIds.length > 0) {
    return {
      targetAgentIds: explicitAgentIds,
      source: "explicit",
      validMentions: [],
      unknownMentions: [],
    };
  }

  const mentionMap = {
    ...(input.config.mention_map ?? {}),
    ...buildMentionMap(input.config.agent_setups ?? []),
  };
  const mentions = extractMentions(input.text);
  const validMentions: string[] = [];
  const unknownMentions: string[] = [];
  const mentionTargets: string[] = [];
  for (const mention of mentions) {
    const mappedAgentId = mentionMap[normalizeNickname(mention)];
    if (mappedAgentId) {
      validMentions.push(mention);
      mentionTargets.push(mappedAgentId);
    } else {
      unknownMentions.push(mention);
    }
  }

  const mentionTargetIds = Array.from(new Set(mentionTargets));
  if (mentionTargetIds.length > 0) {
    if (input.origin === "agent" && input.config.auto !== true) {
      return {
        targetAgentIds: [],
        source: "none",
        validMentions,
        unknownMentions,
      };
    }
    return {
      targetAgentIds: mentionTargetIds,
      source: "mention",
      validMentions,
      unknownMentions,
    };
  }

  if (input.config.auto === true && input.config.default_agent) {
    return {
      targetAgentIds: [input.config.default_agent],
      source: "default",
      validMentions,
      unknownMentions,
    };
  }

  return {
    targetAgentIds: [],
    source: "none",
    validMentions,
    unknownMentions,
  };
}

export function normalizeChatRoutingConfig(
  rawConfig: Record<string, unknown> | null | undefined
): ChatRoutingConfig {
  const draft: Record<string, unknown> = {
    ...(rawConfig ?? {}),
  };

  const rawAgentSetups = Array.isArray(draft.agent_setups) ? draft.agent_setups : [];
  if (rawAgentSetups.length > 0) {
    draft.agent_setups = rawAgentSetups;
  } else {
    draft.agent_setups = [];
  }

  const rawMentionMap =
    draft.mention_map && typeof draft.mention_map === "object" && !Array.isArray(draft.mention_map)
      ? (draft.mention_map as Record<string, unknown>)
      : {};
  const normalizedMentionMap: Record<string, string> = {};
  for (const [nickname, agentId] of Object.entries(rawMentionMap)) {
    if (typeof agentId === "string" && agentId.length > 0) {
      normalizedMentionMap[normalizeNickname(nickname)] = agentId;
    }
  }
  draft.mention_map = normalizedMentionMap;

  // Backward compatibility for legacy agent policy booleans
  if (typeof draft.auto !== "boolean") {
    const policy =
      draft.agent_policy && typeof draft.agent_policy === "object"
        ? (draft.agent_policy as Record<string, unknown>)
        : undefined;
    if (policy && typeof policy.auto_trigger === "boolean") {
      draft.auto = policy.auto_trigger;
    }
  }

  const parsed = chatRoutingConfigSchema.safeParse(draft);
  if (parsed.success) {
    return parsed.data;
  }

  // Last-resort fallback for legacy chats: keep defaults and permissive behavior.
  return chatRoutingConfigSchema.parse({
    topology: "chat",
    history_mode: "internal",
    auto: false,
    default_agent:
      typeof rawConfig?.default_agent === "string" ? rawConfig.default_agent : undefined,
    system_prompt:
      typeof rawConfig?.system_prompt === "string" ? rawConfig.system_prompt : undefined,
    mention_map: normalizedMentionMap,
    agent_setups: [],
  });
}

export function buildChatConfig(input: {
  config?: ChatConfigPatch;
  agentSetup: ChatAgentSetup[];
}): ChatRoutingConfig {
  const mentionMap = buildMentionMap(input.agentSetup);
  const systemPrompt =
    input.config?.system_prompt?.trim() || buildDefaultSystemPrompt(input.agentSetup);

  return chatRoutingConfigSchema.parse({
    topology: "chat",
    history_mode: "internal",
    auto: true,
    compaction_threshold: 50,
    trigger_depth_limit: 10,
    mention_routing_enabled: true,
    ...input.config,
    agent_setups: input.agentSetup,
    mention_map: mentionMap,
    system_prompt: systemPrompt,
  });
}
