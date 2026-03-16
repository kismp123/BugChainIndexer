const { pool, ensureDbUrl } = require('./db');

/**
 * Get approvals with filtering and cursor pagination
 */
exports.getApprovalsByFilter = async (filters = {}) => {
  ensureDbUrl();

  const {
    spender, owner, tokenAddress, networks,
    limit = 50, cursor
  } = filters;

  const where = [];
  const params = [];

  if (networks && networks.length > 0) {
    params.push(networks);
    where.push(`network = ANY($${params.length})`);
  }
  if (spender) {
    params.push(spender.toLowerCase());
    where.push(`spender = $${params.length}`);
  }
  if (owner) {
    params.push(owner.toLowerCase());
    where.push(`owner = $${params.length}`);
  }
  if (tokenAddress) {
    params.push(tokenAddress.toLowerCase());
    where.push(`token_address = $${params.length}`);
  }

  // Cursor pagination (keyset on block_number DESC, log_index DESC)
  if (cursor && cursor.block_number != null) {
    params.push(cursor.block_number, cursor.log_index ?? 0);
    where.push(`(block_number < $${params.length - 1} OR (block_number = $${params.length - 1} AND log_index < $${params.length}))`);
  }

  const take = Math.min(Math.max(+limit || 50, 1), 200);

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const sql = `
    SELECT owner, spender, token_address, value,
           block_number, tx_hash, log_index, network,
           first_seen, last_updated
    FROM approvals
    ${whereSql}
    ORDER BY block_number DESC, log_index DESC
    LIMIT ${take + 1}
  `;

  const { rows } = await pool.query(sql, params);

  const hasNext = rows.length > take;
  const data = hasNext ? rows.slice(0, take) : rows;

  let nextCursor = null;
  if (hasNext) {
    const last = data[data.length - 1];
    nextCursor = {
      block_number: last.block_number,
      log_index: last.log_index
    };
  }

  return { limit: take, hasNext, nextCursor, data };
};

/**
 * Get approval statistics per network
 */
exports.getApprovalStats = async (network = null) => {
  ensureDbUrl();

  let sql = `
    SELECT
      network,
      COUNT(*)::bigint AS total_approvals,
      COUNT(DISTINCT spender) AS unique_spenders,
      COUNT(DISTINCT owner) AS unique_owners,
      COUNT(DISTINCT token_address) AS unique_tokens,
      MAX(block_number) AS latest_block,
      MAX(last_updated) AS last_updated
    FROM approvals
  `;

  const params = [];
  if (network) {
    sql += ` WHERE network = $1`;
    params.push(network);
  }

  sql += ` GROUP BY network ORDER BY network`;

  const { rows } = await pool.query(sql, params);

  // Convert bigint counts to numbers
  return rows.map(r => ({
    ...r,
    total_approvals: Number(r.total_approvals),
    unique_spenders: Number(r.unique_spenders),
    unique_owners: Number(r.unique_owners),
    unique_tokens: Number(r.unique_tokens)
  }));
};
