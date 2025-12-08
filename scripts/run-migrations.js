/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const migrationsDir = path.join(__dirname, '..', 'migrations');
const databaseUrl = process.env.DATABASE_URL;
const embeddingDim = process.env.EMBEDDING_DIM || '1536';

if (!databaseUrl) {
  console.error('DATABASE_URL is required to run migrations.');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

async function run() {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No migration files found.');
    return;
  }

  for (const file of files) {
    const fullPath = path.join(migrationsDir, file);
    let sql = fs.readFileSync(fullPath, 'utf8');
    sql = sql.replace(/{{EMBEDDING_DIM}}/g, embeddingDim);
    console.log(`Running migration: ${file}`);
    await pool.query(sql);
  }
}

run()
  .then(() => {
    console.log('Migrations completed.');
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    pool.end();
  });
