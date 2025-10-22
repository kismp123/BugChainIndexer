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
  const { limit = 50, includeTotal = false, sortBy = 'fund', hideUnnamed = false, ...rest } = filters;
  const { whereSql, params, whereSqlNoCursor, paramsNoCursor } = buildWhere(rest, sortBy);

  const take = Math.min(Math.max(+limit || 50, 1), 200);

  // Determine ORDER BY clause based on sortBy parameter
  let orderByClause;
  if (sortBy === 'first_seen') {
    orderByClause = 'ORDER BY first_seen DESC NULLS LAST, address ASC';
  } else {
    // Default: sort by fund
    orderByClause = 'ORDER BY fund DESC NULLS LAST, deployed DESC NULLS LAST, address ASC';
  }

  // Build SQL based on hideUnnamed flag
  let dataSql;
  if (hideUnnamed) {
    // Use DISTINCT ON to get unique contract names (keep first occurrence by sort order)
    // Also exclude contracts without names
    // IMPORTANT: When using DISTINCT ON, ORDER BY must start with the DISTINCT ON expression
    // We use a subquery approach:
    // 1. Inner query: DISTINCT ON to get one row per contract_name (highest fund or latest first_seen)
    // 2. Outer query: Re-sort by the desired order (fund DESC or first_seen DESC)
    let distinctOrderByClause;
    if (sortBy === 'first_seen') {
      distinctOrderByClause = 'ORDER BY contract_name, first_seen DESC NULLS LAST, fund DESC NULLS LAST, address ASC';
    } else {
      distinctOrderByClause = 'ORDER BY contract_name, fund DESC NULLS LAST, deployed DESC NULLS LAST, address ASC';
    }

    dataSql = `
      SELECT * FROM (
        SELECT DISTINCT ON (contract_name) address, contract_name, deployed, fund, network, first_seen
        FROM addresses
        WHERE
          (tags IS NULL OR NOT 'EOA' = ANY(tags))
          AND contract_name IS NOT NULL
          AND contract_name != ''
          ${whereSql ? 'AND ' + whereSql.replace('WHERE ', '') : ''}
        ${distinctOrderByClause}
      ) AS distinct_contracts
      ${orderByClause}
      LIMIT ${take + 1}
    `;
  } else {
    dataSql = `
      SELECT address, contract_name, deployed, fund, network, first_seen
      FROM addresses
      WHERE
        (tags IS NULL OR NOT 'EOA' = ANY(tags))
        ${whereSql ? 'AND ' + whereSql.replace('WHERE ', '') : ''}
      ${orderByClause}
      LIMIT ${take + 1}
    `;
  }

  const dataPromise = pool.query(dataSql, params);

  // Optimize count query: use cached network counts when possible
  let countPromise;
  if (includeTotal) {
    const hasOnlyNetworkFilter = rest.networks?.length > 0
      && !rest.address && !rest.contractName
      && !rest.deployedFrom && !rest.deployedTo
      && !rest.fundFrom && !rest.fundTo
      && !hideUnnamed;

    if (hasOnlyNetworkFilter) {
      // Fast path: sum cached network counts
      countPromise = (async () => {
        const networkCounts = await exports.getNetworkCounts();
        const total = rest.networks.reduce((sum, net) => sum + (networkCounts[net] || 0), 0);
        return { rows: [{ total: BigInt(total) }] };
      })();
    } else {
      // Exact count for specific filters
      let countSql;
      if (hideUnnamed) {
        // Count only distinct contract names (excluding unnamed contracts)
        countSql = `
          SELECT COUNT(DISTINCT contract_name)::bigint AS total
          FROM addresses
          WHERE (tags IS NULL OR NOT 'EOA' = ANY(tags))
            AND contract_name IS NOT NULL
            AND contract_name != ''
            ${whereSqlNoCursor ? 'AND ' + whereSqlNoCursor.replace('WHERE ', '') : ''}
        `;
      } else {
        // Count all matching addresses
        countSql = `
          SELECT COUNT(*)::bigint AS total
          FROM addresses
          WHERE (tags IS NULL OR NOT 'EOA' = ANY(tags))
            ${whereSqlNoCursor ? 'AND ' + whereSqlNoCursor.replace('WHERE ', '') : ''}
        `;
      }
      countPromise = pool.query(countSql, paramsNoCursor);
    }
  } else {
    countPromise = Promise.resolve({ rows: [{ total: null }] });
  }

  const [{ rows }, { rows: countRows }] = await Promise.all([dataPromise, countPromise]);

  const hasNext = rows.length > take;
  const data = hasNext ? rows.slice(0, take) : rows;

  let nextCursor = null;
  if (hasNext) {
    const last = data[data.length - 1];
    if (sortBy === 'first_seen') {
      nextCursor = {
        first_seen: last.first_seen ?? null,
        address: last.address,
      };
    } else {
      // Default: fund-based cursor
      nextCursor = {
        fund: last.fund ?? null,
        deployed: last.deployed ?? null,
        address: last.address,
      };
    }
  }

  const totalCount = countRows[0]?.total != null ? Number(countRows[0].total) : null;
  const totalPages = totalCount != null ? Math.ceil(totalCount / take) : null;

  return { limit: take, hasNext, nextCursor, totalCount, totalPages, data };
};

function buildWhere({
  deployedFrom, deployedTo, fundFrom, fundTo, networks, tags,
  address, contractName, cursor
}, sortBy = 'fund') {
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
    if (sortBy === 'first_seen') {
      params.push(cursor.first_seen ?? null, cursor.address);
      const f1 = `$${params.length-1}`;
      const f2 = `$${params.length}`;
      where.push(`
        (
          COALESCE(first_seen, -1) <  COALESCE(${f1}, -1)
          OR (COALESCE(first_seen, -1) = COALESCE(${f1}, -1) AND address > ${f2})
        )
      `);
    } else {
      // Default: fund-based cursor
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
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
    whereSqlNoCursor: whereNoCursor.length ? `WHERE ${whereNoCursor.join(' AND ')}` : '',
    paramsNoCursor
  };
}

// ensureDbUrl is provided by ./db; local duplicate removed


// Cache for network counts (refreshed every 4 hours)
let networkCountsCache = null;
let networkCountsCacheTime = 0;
const NETWORK_COUNTS_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

exports.getNetworkCounts = async () => {
  ensureDbUrl();

  // Return cached result if still valid
  const now = Date.now();
  if (networkCountsCache && (now - networkCountsCacheTime) < NETWORK_COUNTS_CACHE_TTL) {
    return networkCountsCache;
  }

  // Query database
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

  // Update cache
  networkCountsCache = out;
  networkCountsCacheTime = now;

  return out;
}
