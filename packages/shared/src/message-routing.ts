/**
 * Utilities for client-side message routing.
 * Extracts @mentions from user input and maps them to agent IDs.
 */

import { normalizeNickname } from "./chat-contract";

export interface Agent {
  id: string;
  name: string;
}

/**
 * Extract @mention names from text.
 * Returns normalized (lowercase) nicknames found in text.
 */
export function extractMentions(text: string): string[] {
  const mentions = new Set<string>();
  const regex = /(^|[\s.,;:!?()[\]{}"'`])@([a-zA-Z][a-zA-Z0-9_-]*)/g;
  let match: RegExpExecArray | null = regex.exec(text);
  while (match) {
    mentions.add(match[2] ?? "");
    match = regex.exec(text);
  }
  return Array.from(mentions);
}

/**
 * Map extracted @mention names to agent IDs.
 * Uses normalizeNickname for case-insensitive matching against agent names.
 *
 * @param mentions - Raw @mention names extracted from text
 * @param agents - Available agents with id and name
 * @returns Array of agent IDs that were mentioned
 */
export function mapMentionsToAgentIds(
  mentions: string[],
  agents: Agent[],
): string[] {
  const agentIds: string[] = [];

  for (const mention of mentions) {
    const agent = agents.find((a) => normalizeNickname(a.name) === normalizeNickname(mention));
    if (agent) {
      agentIds.push(agent.id);
    }
  }

  return agentIds;
}

/**
 * Extract @mentions from text and map them to agent IDs.
 * Convenience function combining extractMentions and mapMentionsToAgentIds.
 *
 * @param text - User message text
 * @param agents - Available agents
 * @returns Array of agent IDs that were mentioned
 */
export function extractAndMapMentions(text: string, agents: Agent[]): string[] {
  const mentions = extractMentions(text);
  return mapMentionsToAgentIds(mentions, agents);
}
