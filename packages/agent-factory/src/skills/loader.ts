import { z } from "zod";
import type { ToolImplementation } from "../types";

/**
 * Create a skill loader tool that allows agents to load and retrieve skill content.
 * Skills are pre-loaded markdown documents stored in the database.
 */
export function createSkillLoaderTool(
  skills: Array<{ name: string; description?: string; content: string }>,
): ToolImplementation {
  // Build a case-insensitive lookup map
  const skillMap = new Map(
    skills.map((s) => [s.name.toLowerCase(), s]),
  );

  const loadSkillSchema = z.object({
    name: z
      .string()
      .describe("The skill name to load (e.g., 'deploy', 'test-runner')"),
  });

  return {
    id: "load_skill",
    description: "Load a skill to get specialized instructions and guidelines",
    schema: loadSkillSchema,
    execute: async (args: z.infer<typeof loadSkillSchema>) => {
      const { name } = args;
      const skill = skillMap.get(name.toLowerCase());
      if (!skill) {
        return {
          ok: false,
          error: "skill_not_found",
          message: `Skill '${name}' not found`,
        };
      }
      return { ok: true, content: skill.content };
    },
  } as ToolImplementation<typeof loadSkillSchema>;
}
