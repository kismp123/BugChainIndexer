const { Pool } = require('pg');

// Build pool config from env
function getPoolConfig() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/bugchain_indexer';
  const useSSL = String(process.env.DATABASE_SSL || '').toLowerCase() === 'true';
  const rejectUnauthorized = String(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED || '').toLowerCase() !== 'false';
  const cfg = { connectionString };
  if (useSSL) cfg.ssl = { rejectUnauthorized };
  return cfg;
}

const pool = new Pool(getPoolConfig());

function ensureDbUrl() {
  if (!process.env.DATABASE_URL) {
    // Set default if missing
    process.env.DATABASE_URL = 'postgresql://postgres@localhost:5432/bugchain_indexer';
  }
}

module.exports = { pool, ensureDbUrl };
