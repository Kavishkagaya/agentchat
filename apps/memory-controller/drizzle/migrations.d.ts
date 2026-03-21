export interface Journal {
  version: string;
  dialect: string;
  entries: Array<{
    idx: number;
    when: number;
    tag: string;
    breakpoints: boolean;
  }>;
}

export interface MigrationConfig {
  journal: Journal;
  migrations: Record<string, string>;
}

declare const config: MigrationConfig;
export default config;
