import { Pool } from 'pg';
import { env, requireEnvString } from './env';

if (!env.databaseUrl) {
  throw new Error('DATABASE_URL must be set to initialize the database pool.');
}

export const pool = new Pool({
  connectionString: requireEnvString('databaseUrl')
});

export const getClient = async () => pool.connect();
