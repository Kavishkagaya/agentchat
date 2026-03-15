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
  compaction_threshold: z.number().int().min(1000).max(200000).default(50000),
  trigger_depth_limit: z.number().int().min(1).max(100).default(10),
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
};

export type RoutingTokenRequestPayload = {
  config_id: string;
  role?: string;
};

export type ChatActivateResponse = {
  ok: boolean;
  memory_controller_id?: string;
};

export type RoutingTokenResponse = {
  ok: boolean;
  routing_token: string;
};

export interface CleanupRequestPayload {
  config_id: string;
  status?: "active" | "idle" | "archived";
}

export interface ChatArchiveSnapshotResponse {
  ok: boolean;
  snapshot?: Record<string, unknown>;
}

export type MessageOrigin = "user" | "agent";

// ── Agent config JSON shape (stored in agents.config jsonb) ──────

export type AgentToolRef = {
  id: string;
  name?: string;
  description?: string;
  parameters?: Record<string, unknown>;
  config?: Record<string, unknown>;
};

export type AgentConfigJson = {
  agent_id?: string;
  provider?: string;
  model?: string;
  system_prompt?: string;
  tools?: AgentToolRef[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  stop?: string[];
  seed?: number;
  [key: string]: unknown;
};

// ── Agent SSE event types (agents service → memory-controller) ──

export type AgentSseStatus = "thinking" | "running" | "completed";

export type AgentUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type AgentSseEvent =
  | { type: "status"; status: AgentSseStatus }
  | { type: "text_delta"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool_call"; tool_call_id: string; name: string; args: unknown }
  | { type: "tool_result"; tool_call_id: string; name: string; result: unknown }
  | { type: "tool_error"; tool_call_id: string; error: string }
  | { type: "step_finish"; finish_reason: string; usage: AgentUsage | null }
  | { type: "error"; code: string; message: string }
  | {
      type: "final";
      agent_id: string;
      config_id: string | null;
      runtime_id?: string;
      text: string;
      finish_reason: string;
      usage: AgentUsage | null;
      agent_nickname: string;
    };

// ── Server → Client WebSocket events ────────────────────────

export type ChatWsEvent =
  | { type: "initializing" }
  | { type: "ready" }
  | {
      type: "user_message_stored";
      message_id: string;
      sender_id?: string;
      sender_name?: string;
      text: string;
    }
  | {
      type: "agent_start";
      agent_id: string;
      agent_nickname: string;
      message_id: string;
    }
  | { type: "text_delta"; agent_id: string; message_id: string; text: string }
  | { type: "reasoning"; agent_id: string; message_id: string; text: string }
  | {
      type: "tool_call";
      agent_id: string;
      message_id: string;
      tool_call_id: string;
      name: string;
      args: unknown;
    }
  | {
      type: "tool_result";
      agent_id: string;
      message_id: string;
      tool_call_id: string;
      name: string;
      result: unknown;
    }
  | {
      type: "agent_status";
      agent_id: string;
      message_id: string;
      status: AgentSseStatus;
    }
  | {
      type: "agent_message";
      message_id: string;
      agent_id: string;
      agent_nickname: string;
      text: string;
    }
  | {
      type: "agent_error";
      agent_id: string;
      message_id: string;
      code: string;
      message: string;
    }
  | {
      type: "routing_warning";
      message_id: string;
      unknown_mentions: string[];
      source: string;
      origin: string;
    }
  | { type: "history_cleared" }
  | { type: "done" }
  | { type: "error"; code: string; message: string };

// ── Chat history response ───────────────────────────────────

export type ChatHistoryMessage = {
  message_id: string;
  role: "user" | "assistant";
  text: string;
  sender_id?: string | null;
  sender_name?: string | null;
  agent_id?: string | null;
  agent_nickname?: string | null;
  tokens?: number;
  created_at: string;
};

export type ChatHistoryResponse = {
  messages: ChatHistoryMessage[];
  next_cursor?: string;
  has_more: boolean;
  type: "chat";
};

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

export function buildMentionMap(
  agentSetup: ChatAgentSetup[],
): Record<string, string> {
  const mentionMap: Record<string, string> = {};
  for (const setup of agentSetup) {
    mentionMap[normalizeNickname(setup.nickname)] = setup.agentId;
  }
  return mentionMap;
}

export type AgentChatContext = {
  identity: string;
  team: string;
};

export function buildAgentChatContext(params: {
  agentNickname: string;
  agentSetups: ChatAgentSetup[];
}): AgentChatContext {
  const normalizedSelf = normalizeNickname(params.agentNickname);
  const selfSetup = params.agentSetups.find(
    (s) => normalizeNickname(s.nickname) === normalizedSelf,
  );

  const identityLines: string[] = [];
  identityLines.push(`Your name is ${params.agentNickname}.`);
  if (selfSetup) {
    identityLines.push(`Your responsibility: ${selfSetup.responsibility}`);
  }
  identityLines.push("");
  identityLines.push("Identity rules:");
  identityLines.push(
    `- You ARE ${params.agentNickname}. Fully embody this identity throughout the conversation.`,
  );
  identityLines.push(
    `- Refer to yourself naturally as "I" — never write @${params.agentNickname} or tag yourself.`,
  );
  identityLines.push(
    `- Never say "As an AI", "As a language model", or "As an assistant".`,
  );
  identityLines.push(
    `- Do not echo or repeat name tags like [${params.agentNickname}] from message history.`,
  );
  identityLines.push(`- Always format your responses in Markdown.`);

  const teamLines: string[] = [];
  const others = params.agentSetups.filter(
    (s) => normalizeNickname(s.nickname) !== normalizedSelf,
  );
  if (others.length > 0) {
    teamLines.push("You are collaborating in a multi-agent chat.");
    teamLines.push("Other team members:");
    for (const setup of others) {
      teamLines.push(`- ${setup.nickname}: ${setup.responsibility}`);
    }
    teamLines.push("");
    teamLines.push("Collaboration:");
    teamLines.push(
      "- You are a team. Actively @mention teammates when the task needs their expertise.",
    );
    teamLines.push(
      "- If a request falls outside your responsibility or would benefit from another agent's skills, hand off with @name.",
    );
    teamLines.push(
      "- Do not try to do everything yourself — leverage your team.",
    );
    teamLines.push("");
    teamLines.push("@mention rules (using @ TRIGGERS that agent to run):");
    teamLines.push(
      "- Use @name to hand off, delegate, or ask a teammate to act.",
    );
    teamLines.push(
      "- Do NOT use @ when merely referring to a teammate in conversation — just use their name.",
    );
    teamLines.push(`- NEVER @mention yourself (@${params.agentNickname}).`);

    const otherNames = others.map((s) => s.nickname);
    const exampleOther = otherNames[0];
    teamLines.push("");
    teamLines.push("Examples:");
    teamLines.push(
      `  Referring: "I agree with ${exampleOther}'s point" (no trigger)`,
    );
    teamLines.push(
      `  Delegating: "@${exampleOther} can you handle the implementation?" (triggers ${exampleOther})`,
    );
    teamLines.push("");
    teamLines.push("Keep responses concise, actionable, and role-aligned.");
  }

  return {
    identity: identityLines.join("\n"),
    team: teamLines.join("\n"),
  };
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

export function resolveMessageTargets(
  input: MessageRoutingInput,
): MessageRoutingDecision {
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

  if (
    input.origin !== "agent" &&
    input.config.auto === true &&
    input.config.default_agent
  ) {
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
  rawConfig: Record<string, unknown> | null | undefined,
): ChatRoutingConfig {
  const draft: Record<string, unknown> = {
    ...(rawConfig ?? {}),
  };

  const rawAgentSetups = Array.isArray(draft.agent_setups)
    ? draft.agent_setups
    : [];
  if (rawAgentSetups.length > 0) {
    draft.agent_setups = rawAgentSetups;
  } else {
    draft.agent_setups = [];
  }

  const rawMentionMap =
    draft.mention_map &&
    typeof draft.mention_map === "object" &&
    !Array.isArray(draft.mention_map)
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
      typeof rawConfig?.default_agent === "string"
        ? rawConfig.default_agent
        : undefined,
    mention_map: normalizedMentionMap,
    agent_setups: [],
  });
}

export function buildChatConfig(input: {
  config?: ChatConfigPatch;
  agentSetup: ChatAgentSetup[];
}): ChatRoutingConfig {
  const mentionMap = buildMentionMap(input.agentSetup);

  return chatRoutingConfigSchema.parse({
    topology: "chat",
    history_mode: "internal",
    auto: true,
    compaction_threshold: 50000,
    trigger_depth_limit: 10,
    ...input.config,
    agent_setups: input.agentSetup,
    mention_map: mentionMap,
  });
}
