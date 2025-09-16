const { pool, ensureDbUrl } = require('./db');
exports.getContractCount = async () => {
  ensureDbUrl();
  const result = await pool.query(`
    SELECT COUNT(*) as count 
    FROM addresses 
    WHERE (tags IS NULL OR NOT 'EOA' = ANY(tags))
  `);
  return { result: result.rows };
}

// Perform exact count only when includeTotal=true
exports.getAddressesByFilter = async (filters = {}) => {
  ensureDbUrl();
  const { limit = 50, includeTotal = false, ...rest } = filters;
  const { whereSql, params, whereSqlNoCursor, paramsNoCursor } = buildWhere(rest);

  const take = Math.min(Math.max(+limit || 50, 1), 200);

  const dataSql = `
    SELECT address, contract_name, deployed, fund, network
    FROM addresses
    WHERE 
      (tags IS NULL OR NOT 'EOA' = ANY(tags))
      ${whereSql ? 'AND ' + whereSql.replace('WHERE ', '') : ''}
    ORDER BY fund DESC NULLS LAST, deployed DESC NULLS LAST, address ASC
    LIMIT ${take + 1}
  `;

  const dataPromise = pool.query(dataSql, params);
  const countPromise = includeTotal
    ? pool.query(`SELECT COUNT(*)::bigint AS total FROM addresses WHERE (tags IS NULL OR NOT 'EOA' = ANY(tags)) ${whereSqlNoCursor ? 'AND ' + whereSqlNoCursor.replace('WHERE ', '') : ''}`, paramsNoCursor)
    : Promise.resolve({ rows: [{ total: null }] });

  const [{ rows }, { rows: countRows }] = await Promise.all([dataPromise, countPromise]);

  const hasNext = rows.length > take;
  const data = hasNext ? rows.slice(0, take) : rows;

  let nextCursor = null;
  if (hasNext) {
    const last = data[data.length - 1];
    nextCursor = {
      fund: last.fund ?? null,       // ✅ Sort priority 1
      deployed: last.deployed ?? null, // ✅ Sort priority 2
      address: last.address,         // ✅ Sort priority 3 (tie-breaker)
    };
  }

  const totalCount = countRows[0]?.total != null ? Number(countRows[0].total) : null;
  const totalPages = totalCount != null ? Math.ceil(totalCount / take) : null;

  return { limit: take, hasNext, nextCursor, totalCount, totalPages, data };
};

function buildWhere({
  deployedFrom, deployedTo, fundFrom, fundTo, networks, tags,
  address, contractName, cursor
}) {
  const where = [], params = [];
  const whereNoCursor = [], paramsNoCursor = [];

  const addBoth = (sql, val) => {
    params.push(val);
    where.push(sql.replace(/\$(\d+)/g, () => `$${params.length}`));
    paramsNoCursor.push(val);
    whereNoCursor.push(sql.replace(/\$(\d+)/g, () => `$${paramsNoCursor.length}`));
  };

  if (deployedFrom != null) addBoth(`deployed > $1`, deployedFrom);
  if (deployedTo   != null) addBoth(`deployed <=  $1`, deployedTo);
  if (fundFrom     != null) addBoth(`fund     >= $1`, fundFrom);
  if (fundTo       != null) addBoth(`fund      < $1`, fundTo);
  if (networks?.length)     addBoth(`network = ANY($1)`, networks);
  if (tags?.length)         addBoth(`tags && $1::text[]`, tags);
  if (address) {
    // Addresses are already stored in lowercase, so direct comparison is possible
    const addressStr = address.toLowerCase();
    if (addressStr.length === 42 && addressStr.startsWith('0x')) {
      // Use exact matching for complete addresses (fastest)
      addBoth(`address = $1`, addressStr);
    } else if (addressStr.length >= 10) {
      // Use prefix matching for 10+ characters (can utilize index)
      addBoth(`address LIKE $1`, `${addressStr}%`);
    } else {
      // Use partial matching for short search terms
      addBoth(`address LIKE $1`, `%${addressStr}%`);
    }
  }
  if (contractName)         addBoth(`contract_name ILIKE $1`, `%${contractName}%`);

  // 🔑 Cursor conditions are added only to "data where" (not added to count query)
  if (cursor && cursor.address) {
    params.push(cursor.fund ?? null, cursor.deployed ?? null, cursor.address);
    const f1 = `$${params.length-2}`;
    const f2 = `$${params.length-1}`;
    const f3 = `$${params.length}`;
    where.push(`
      (
        COALESCE(fund, -1) <  COALESCE(${f1}, -1)
        OR (COALESCE(fund, -1) = COALESCE(${f1}, -1) AND COALESCE(deployed, -1) <  COALESCE(${f2}, -1))
        OR (COALESCE(fund, -1) = COALESCE(${f1}, -1) AND COALESCE(deployed, -1) = COALESCE(${f2}, -1) AND address > ${f3})
      )
    `);
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
    whereSqlNoCursor: whereNoCursor.length ? `WHERE ${whereNoCursor.join(' AND ')}` : '',
    paramsNoCursor
  };
}

// ensureDbUrl is provided by ./db; local duplicate removed


exports.getNetworkCounts = async () => {
  ensureDbUrl();
  const { rows } = await pool.query(`
    SELECT network, COUNT(*)::bigint AS count
    FROM addresses
    WHERE (tags IS NULL OR NOT 'EOA' = ANY(tags))
    GROUP BY network
  `);
  const out = {};
  for (const r of rows) {
    out[r.network] = Number(r.count);
  }
  return out;
}
