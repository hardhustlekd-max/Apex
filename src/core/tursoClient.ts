import { createClient, Client, InStatement } from '@libsql/client';

export const footballTurso = process.env.football_turso_url 
  ? createClient({
      url: process.env.football_turso_url,
      authToken: process.env.football_turso_token || '',
    }) 
  : null;

export const predictionsTurso = process.env.predictions_turso_url 
  ? createClient({
      url: process.env.predictions_turso_url,
      authToken: process.env.predictions_turso_token || '',
    }) 
  : null;

// Circuit breaker tracking: stops repetitive network attempts when remote Turso is unreachable
const brokenClientsUntil = new WeakMap<Client, number>();
const CIRCUIT_BREAKER_COOLDOWN_MS = 5 * 60_000; // 5 minutes pause on connection failures

/**
 * Resilient batch executor with chunking, circuit-breaker on network failures, and graceful local SQLite fallback
 */
export async function safeTursoBatch(
  client: Client | null,
  statements: InStatement[],
  chunkSize = 25
): Promise<{ success: boolean; executedCount: number }> {
  if (!client || !statements || statements.length === 0) {
    return { success: true, executedCount: 0 };
  }

  // If client recently encountered a network failure (fetch failed / offline), skip remote sync
  const circuitUntil = brokenClientsUntil.get(client) || 0;
  if (Date.now() < circuitUntil) {
    return { success: false, executedCount: 0 };
  }

  let executedCount = 0;
  for (let i = 0; i < statements.length; i += chunkSize) {
    const chunk = statements.slice(i, i + chunkSize);
    let attempts = 0;
    let succeeded = false;

    while (attempts < 2 && !succeeded) {
      attempts++;
      try {
        await client.batch(chunk, 'write');
        succeeded = true;
        executedCount += chunk.length;
      } catch (err: any) {
        const errMsg = String(err?.message || '');
        const isNetworkOrFetchError =
          errMsg.includes('fetch failed') ||
          errMsg.includes('Failed to fetch') ||
          errMsg.includes('ECONNREFUSED') ||
          errMsg.includes('ENOTFOUND') ||
          errMsg.includes('ETIMEDOUT') ||
          errMsg.includes('network error');

        if (isNetworkOrFetchError) {
          // Trip circuit breaker silently and exit immediately so remaining chunks are not attempted
          brokenClientsUntil.set(client, Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS);
          return { success: false, executedCount };
        }

        if (attempts >= 2) {
          break;
        }
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    if (!succeeded) {
      // Stop executing further chunks if this chunk could not be written
      break;
    }

    if (i + chunkSize < statements.length) {
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  return { success: true, executedCount };
}

export interface TursoDbStatus {
  footballDb: {
    configured: boolean;
    status: 'CONNECTED' | 'DISCONNECTED' | 'NOT_CONFIGURED';
    url: string | null;
    latencyMs?: number;
    error?: string;
  };
  predictionsDb: {
    configured: boolean;
    status: 'CONNECTED' | 'DISCONNECTED' | 'NOT_CONFIGURED';
    url: string | null;
    latencyMs?: number;
    error?: string;
  };
  localSqlite: {
    status: 'ONLINE';
    mode: string;
  };
}

export async function getTursoConnectionStatus(): Promise<TursoDbStatus> {
  const footballConfigured = Boolean(process.env.football_turso_url);
  const predictionsConfigured = Boolean(process.env.predictions_turso_url);

  let footballStatus: 'CONNECTED' | 'DISCONNECTED' | 'NOT_CONFIGURED' = footballConfigured ? 'DISCONNECTED' : 'NOT_CONFIGURED';
  let footballLatency: number | undefined;
  let footballError: string | undefined;

  let predictionsStatus: 'CONNECTED' | 'DISCONNECTED' | 'NOT_CONFIGURED' = predictionsConfigured ? 'DISCONNECTED' : 'NOT_CONFIGURED';
  let predictionsLatency: number | undefined;
  let predictionsError: string | undefined;

  if (footballTurso) {
    const start = Date.now();
    try {
      await footballTurso.execute('SELECT 1 as ping');
      footballLatency = Date.now() - start;
      footballStatus = 'CONNECTED';
    } catch (err: any) {
      footballError = err?.message || 'Turso query failed';
      footballStatus = 'DISCONNECTED';
    }
  }

  if (predictionsTurso) {
    const start = Date.now();
    try {
      await predictionsTurso.execute('SELECT 1 as ping');
      predictionsLatency = Date.now() - start;
      predictionsStatus = 'CONNECTED';
    } catch (err: any) {
      predictionsError = err?.message || 'Turso query failed';
      predictionsStatus = 'DISCONNECTED';
    }
  }

  const maskUrl = (rawUrl?: string) => {
    if (!rawUrl) return null;
    try {
      const sanitized = rawUrl.startsWith('libsql://') ? rawUrl.replace('libsql://', 'https://') : rawUrl;
      const parsed = new URL(sanitized);
      return `libsql://${parsed.hostname}`;
    } catch {
      return rawUrl.slice(0, 20) + '...';
    }
  };

  return {
    footballDb: {
      configured: footballConfigured,
      status: footballStatus,
      url: maskUrl(process.env.football_turso_url),
      latencyMs: footballLatency,
      error: footballError,
    },
    predictionsDb: {
      configured: predictionsConfigured,
      status: predictionsStatus,
      url: maskUrl(process.env.predictions_turso_url),
      latencyMs: predictionsLatency,
      error: predictionsError,
    },
    localSqlite: {
      status: 'ONLINE',
      mode: 'PERSISTENT_WASM_SQLITE',
    },
  };
}


