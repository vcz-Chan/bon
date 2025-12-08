import { Pool } from 'pg';
import { env, requireEnvString } from './env';

if (!env.databaseUrl) {
  throw new Error('DATABASE_URL이 설정되지 않아 데이터베이스 풀을 초기화할 수 없습니다.');
}

export const pool = new Pool({
  connectionString: requireEnvString('databaseUrl')
});

export const getClient = async () => pool.connect();
