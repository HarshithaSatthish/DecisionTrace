import { getLyzrConfig, LyzrConfig } from './config';
import type { LyzrChatRequest, LyzrChatResponse } from './types';
import type { z } from 'zod';

// ============================================================================
// Lyzr Error Hierarchy
// ============================================================================

export class LyzrConfigurationError extends Error {
  constructor(message: string) {
    super(`Lyzr Configuration Error: ${message}`);
    this.name = 'LyzrConfigurationError';
  }
}

export class LyzrApiError extends Error {
  public statusCode: number;
  public responseBody?: unknown;

  constructor(message: string, statusCode: number, responseBody?: unknown) {
    super(`Lyzr API Error (${statusCode}): ${message}`);
    this.name = 'LyzrApiError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

export class LyzrTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Lyzr Agent request timed out after ${timeoutMs}ms`);
    this.name = 'LyzrTimeoutError';
  }
}

export class LyzrParseError extends Error {
  public rawContent: string;

  constructor(message: string, rawContent: string) {
    super(`Lyzr Response Parsing Error: ${message}`);
    this.name = 'LyzrParseError';
    this.rawContent = rawContent;
  }
}

// ============================================================================
// Helper: Clean & Parse JSON from LLM Output
// ============================================================================

export function extractJsonFromResponse(raw: string): unknown {
  const trimmed = raw.trim();

  // Try direct parse first
  try {
    return JSON.parse(trimmed);
  } catch {
    // If wrapped in ```json ... ``` or ``` ... ```
    const markdownRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
    const match = trimmed.match(markdownRegex);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1].trim());
      } catch (err: unknown) {
        throw new LyzrParseError(
          `Found markdown code block but failed to parse inner JSON: ${err instanceof Error ? err.message : String(err)}`,
          raw
        );
      }
    }

    // Try finding outer curly braces or square brackets
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(trimmed.substring(firstBrace, lastBrace + 1));
      } catch (err: unknown) {
        throw new LyzrParseError(
          `Extracted candidate JSON block but parsing failed: ${err instanceof Error ? err.message : String(err)}`,
          raw
        );
      }
    }

    throw new LyzrParseError('Response did not contain valid JSON content', raw);
  }
}

// ============================================================================
// Lyzr Client
// ============================================================================

export interface LyzrCallOptions {
  userId?: string;
  orgId?: string;
  sessionId?: string;
  timeoutMs?: number;
  maxRetries?: number;
  customApiKey?: string;
  customBaseUrl?: string;
  skipCache?: boolean;
}

interface CacheEntry {
  response: LyzrChatResponse;
  expiresAt: number;
}

const IN_MEMORY_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 150;

export function clearLyzrClientCache(): void {
  IN_MEMORY_CACHE.clear();
}

export class LyzrClient {
  private config: LyzrConfig;

  constructor(customConfig?: Partial<LyzrConfig>) {
    this.config = {
      ...getLyzrConfig(),
      ...customConfig
    };
  }

  /**
   * Invokes a configured Lyzr agent via POST /v3/inference/chat/
   */
  public async chat(
    agentId: string,
    message: string,
    options?: LyzrCallOptions
  ): Promise<LyzrChatResponse> {
    const apiKey = options?.customApiKey || this.config.apiKey;
    if (!apiKey) {
      throw new LyzrConfigurationError(
        'Missing LYZR_API_KEY environment variable. Cannot communicate with Lyzr Studio.'
      );
    }

    if (!agentId) {
      throw new LyzrConfigurationError('Agent ID is required to execute Lyzr chat inference.');
    }

    // Check in-memory cache with strict tenant/user isolation
    const baseUrl = options?.customBaseUrl || this.config.baseUrl;
    const cacheKey = JSON.stringify([options?.orgId, options?.userId, baseUrl, agentId, message.trim()]);
    if (!options?.skipCache) {
      const cached = IN_MEMORY_CACHE.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.response;
      }
    }

    const url = `${baseUrl.replace(/\/+$/, '')}/inference/chat/`;
    const timeoutMs = options?.timeoutMs ?? this.config.timeoutMs;
    const maxRetries = options?.maxRetries ?? this.config.maxRetries;

    const requestBody: LyzrChatRequest = {
      user_id: options?.userId || 'decisiontrace-system-user',
      agent_id: agentId,
      session_id:
        options?.sessionId || `session-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      message
    };

    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= maxRetries) {
      attempt++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });
        clearTimeout(timer);

        const responseText = await response.text();
        let parsedBody: unknown;
        try {
          parsedBody = JSON.parse(responseText);
        } catch {
          parsedBody = responseText;
        }

        if (!response.ok) {
          const isRetryable =
            response.status === 429 || (response.status >= 500 && response.status <= 504);
          const errorMsg =
            typeof parsedBody === 'object' && parsedBody !== null && 'detail' in parsedBody
              ? String((parsedBody as { detail: unknown }).detail)
              : `HTTP ${response.status} ${response.statusText}`;

          if (isRetryable && attempt <= maxRetries) {
            const backoffMs = Math.pow(2, attempt) * 500;
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
          }

          throw new LyzrApiError(errorMsg, response.status, parsedBody);
        }

        const resultResponse = parsedBody as LyzrChatResponse;
        if (!options?.skipCache) {
          if (IN_MEMORY_CACHE.size >= MAX_CACHE_SIZE) {
            const oldestKey = IN_MEMORY_CACHE.keys().next().value;
            if (oldestKey) IN_MEMORY_CACHE.delete(oldestKey);
          }
          IN_MEMORY_CACHE.set(cacheKey, {
            response: resultResponse,
            expiresAt: Date.now() + CACHE_TTL_MS
          });
        }

        return resultResponse;
      } catch (err: unknown) {
        clearTimeout(timer);

        if (err instanceof Error && err.name === 'AbortError') {
          if (attempt <= maxRetries) {
            continue;
          }
          throw new LyzrTimeoutError(timeoutMs);
        }

        if (err instanceof LyzrApiError) {
          throw err;
        }

        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt <= maxRetries) {
          const backoffMs = Math.pow(2, attempt) * 500;
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }
      }
    }

    throw lastError || new Error('Lyzr inference failed after maximum retry attempts');
  }

  /**
   * Invokes an agent and parses/validates structured JSON output using a Zod schema.
   */
  public async chatStructured<T>(
    agentId: string,
    message: string,
    schema: z.ZodType<T>,
    options?: LyzrCallOptions
  ): Promise<T> {
    const rawResponse = await this.chat(agentId, message, options);

    let rawPayload: unknown;
    if (typeof rawResponse.response === 'string') {
      rawPayload = extractJsonFromResponse(rawResponse.response);
    } else if (typeof rawResponse.response === 'object' && rawResponse.response !== null) {
      rawPayload = rawResponse.response;
    } else {
      throw new LyzrParseError(
        'Agent response did not contain string or object payload',
        JSON.stringify(rawResponse)
      );
    }

    const parseResult = schema.safeParse(rawPayload);
    if (!parseResult.success) {
      throw new LyzrParseError(
        `Agent output schema validation failed: ${parseResult.error.message}`,
        typeof rawResponse.response === 'string'
          ? rawResponse.response
          : JSON.stringify(rawResponse.response)
      );
    }

    return parseResult.data;
  }
}
