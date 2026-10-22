import { createClient, Client } from '@libsql/client';

export const footballTurso = process.env.FOOTBALL_TURSO_URL 
  ? createClient({
      url: process.env.FOOTBALL_TURSO_URL,
      authToken: process.env.FOOTBALL_TURSO_TOKEN || '',
    }) 
  : null;

export const predictionsTurso = process.env.PREDICTIONS_TURSO_URL 
  ? createClient({
      url: process.env.PREDICTIONS_TURSO_URL,
      authToken: process.env.PREDICTIONS_TURSO_TOKEN || '',
    }) 
  : null;

