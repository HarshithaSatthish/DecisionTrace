/**
 * Lyzr Agent System Configuration
 * Manages environment variables and configuration parameters for server-side Lyzr AI integration.
 * Safe environment variable resolution: keys are never exposed client-side.
 */

export interface LyzrConfig {
  apiKey: string | null;
  baseUrl: string;
  extractorAgentId: string | null;
  conflictAgentId: string | null;
  plannerAgentId: string | null;
  managerAgentId: string | null;
  timeoutMs: number;
  maxRetries: number;
}

export function getLyzrConfig(): LyzrConfig {
  return {
    apiKey: process.env.LYZR_API_KEY || null,
    baseUrl: process.env.LYZR_API_BASE_URL || 'https://agent-prod.studio.lyzr.ai/v3',
    extractorAgentId: process.env.LYZR_EXTRACTOR_AGENT_ID || null,
    conflictAgentId: process.env.LYZR_CONFLICT_AGENT_ID || null,
    plannerAgentId: process.env.LYZR_PLANNER_AGENT_ID || null,
    managerAgentId: process.env.LYZR_MANAGER_AGENT_ID || null,
    timeoutMs: Number(process.env.LYZR_TIMEOUT_MS) || 15000,
    maxRetries: Number(process.env.LYZR_MAX_RETRIES) || 2
  };
}

/**
 * Checks whether live Lyzr API connectivity is fully configured.
 * Requires LYZR_API_KEY and at least one agent ID.
 */
export function isLyzrConfigured(): boolean {
  const cfg = getLyzrConfig();
  return Boolean(cfg.apiKey && (cfg.managerAgentId || cfg.extractorAgentId));
}

/**
 * Checks whether preview or mock fallback is permitted when live Lyzr API is not configured.
 */
export function isLyzrPreviewAllowed(): boolean {
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW === 'true'
  );
}
