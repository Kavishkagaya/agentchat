import type { ToolImplementation } from "../types";

/**
 * A tool provider supplies tools to be registered into a ToolRegistry.
 * Each provider has a name and returns an array of ToolImplementations.
 */
export interface ToolProvider {
  readonly name: string;
  getTools(): ToolImplementation[] | Promise<ToolImplementation[]>;
}
