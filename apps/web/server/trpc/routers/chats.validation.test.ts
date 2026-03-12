import { chatCreateInputSchema } from "@axon/shared";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`chat validation test failed: ${message}`);
  }
}

export function runChatValidationTests(): void {
  const invalidMissingMetadata = chatCreateInputSchema.safeParse({
    title: "Team Chat",
    agentSetup: [
      {
        agentId: "agent_a",
        nickname: "",
        responsibility: "",
      },
    ],
    config: {
      auto: true,
    },
  });
  assert(
    !invalidMissingMetadata.success,
    "create input should reject missing nickname/responsibility metadata"
  );

  const invalidMissingDefault = chatCreateInputSchema.safeParse({
    title: "Team Chat",
    agentSetup: [
      {
        agentId: "agent_a",
        nickname: "planner",
        responsibility: "Plans work",
      },
    ],
    config: {
      auto: true,
    },
  });
  assert(
    invalidMissingDefault.success,
    "input-level schema allows patch config; strict default requirement is enforced during build"
  );

  const validTwoStepPayload = chatCreateInputSchema.safeParse({
    title: "Team Chat",
    agentSetup: [
      {
        agentId: "agent_a",
        nickname: "planner",
        responsibility: "Plans work",
      },
      {
        agentId: "agent_b",
        nickname: "reviewer",
        responsibility: "Reviews outputs",
      },
    ],
    config: {
      auto: true,
      default_agent: "agent_a",
      system_prompt: "System prompt from step 2",
    },
  });
  assert(validTwoStepPayload.success, "valid two-step payload should pass");
}
