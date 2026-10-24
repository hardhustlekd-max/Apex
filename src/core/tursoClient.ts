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

/**
 * Resilient batch executor with chunking, retry on transient fetch errors, and gentle pacing
 */
export async function safeTursoBatch(
  client: Client | null,
  statements: InStatement[],
  chunkSize = 25
): Promise<{ success: boolean; executedCount: number }> {
  if (!client || !statements || statements.length === 0) {
    return { success: true, executedCount: 0 };
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
        if (attempts >= 2) {
          // Graceful fallback without crashing
          console.warn(`[TursoClient] Batch chunk (${i}-${i + chunk.length}) sync notice: ${err?.message || 'transient network error'}`);
          break;
        }
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    if (i + chunkSize < statements.length) {
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  return { success: true, executedCount };
}

