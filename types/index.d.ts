export interface SignorConfig {
  provider_name?: string;
  provider_id?: string;
  base_url: string;
  api_key?: string;
  api_key_masked?: string;
  secret_ref?: string;
  model: string;
  effort: "low" | "medium" | "high" | "ultra";
  cockpit_port?: number;
  max_retries?: number;
  enabled_models?: string[];
  project_name?: string;
}

export interface ModelMetadata {
  id: string;
  name: string;
  provider: string;
  tier: "flagship" | "reasoning" | "speed" | "code" | "balanced";
  description: string;
  default?: boolean;
  is_remote?: boolean;
  is_fallback?: boolean;
}

export interface ToolCallResult {
  path?: string;
  total_lines?: number;
  start_line?: number;
  end_line?: number;
  is_truncated?: boolean;
  content?: string;
  entries?: Array<{ name: string; type: "file" | "directory" }>;
  error?: string;
}

export interface QualityGateResult {
  hasTests: boolean;
  passed: boolean;
  exitCode?: number;
  output: string;
}

export interface RunRecord {
  id: string;
  kind: string;
  status: string;
  model_id: string;
  effort: string;
  started_at: string;
  finished_at?: string;
  duration_ms?: number;
  error_code?: string;
  error_message?: string;
}

export declare function callSignor(
  messages: Array<{ role: string; content?: string; [key: string]: any }>,
  options: {
    enableTools?: boolean;
    kind?: string;
    projectDir?: string;
    temperature?: number;
    max_tokens?: number;
    timeout?: number;
    max_retries?: number;
    stream?: boolean;
    silent?: boolean;
    noStdout?: boolean;
    onToken?: (token: string) => void;
  },
  config: SignorConfig
): Promise<string>;

export declare function loadConfig(cliOverrides?: Partial<SignorConfig>, startDir?: string): SignorConfig;
export declare function saveLocalConfig(updates: Partial<SignorConfig>, projectDir?: string): { success: boolean; path?: string; config?: SignorConfig; error?: string };
export declare function saveGlobalConfig(updates: Partial<SignorConfig>): { success: boolean; path?: string; config?: SignorConfig; error?: string };
export declare function maskConfig(config: Partial<SignorConfig>): Partial<SignorConfig>;

export declare function validateProviderUrl(urlStr: string): { valid: boolean; reason?: string; sanitizedUrl?: string };
export declare function resolveSafePath(requestedPath: string, projectDir?: string): string;
export declare function atomicWriteFileSync(filePath: string, content: string, options?: { encoding?: string; mode?: number }): void;
export declare function withTransaction<T>(callback: (db: any) => T, projectDir?: string): T;
