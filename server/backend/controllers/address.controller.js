const service = require('../services/address.service');
const { parseNumber, parseStringArray, parseBool, decodeCursor } = require('../utils/parsers');

exports.getContractCount = async (req, res) => {
  try{
    const result = await service.getContractCount();
    res.json(result)
  }catch(err){
    res.status(401).json({error: err.message})
  }
}

// Number/array parsing helpers remain the same as existing implementation
// parseNumber, parseStringArray, decodeCursor ...

exports.getAddressesByFilter = async (req, res) => {
  try {
    const q = { ...req.query, ...req.body };

    // Pagination parameters
    const MAX_LIMIT = 200;
    const limit = Math.min(Math.max(parseNumber(q.limit) ?? 50, 1), MAX_LIMIT);
    const cursor = decodeCursor(q.cursor); // { deployed, fund, address } or null

    // Whether to include total count/pages (default false)
    const includeTotal = parseBool(q.includeTotal);

    const filters = {
      // Range filters
      deployedFrom: parseNumber(q.deployedFrom), // deployed >= deployedFrom
      deployedTo:   parseNumber(q.deployedTo),   // deployed  < deployedTo
      fundFrom:     parseNumber(q.fundFrom),     // fund     >= fundFrom
      fundTo:       parseNumber(q.fundTo),       // fund      < fundTo

      // Array filters
      networks: parseStringArray(q.networks),    // network = ANY(networks)
      tags:     parseStringArray(q.tags),        // tags && $tags

      // Partial/exact match filters
      address:      q.address ? String(q.address).trim() : null,           // address ILIKE %address%
      contractName: q.contractName ? String(q.contractName).trim() : null, // contract_name ILIKE %contractName%

      // Sorting
      sortBy: q.sortBy && ['fund', 'first_seen'].includes(q.sortBy) ? q.sortBy : 'fund',

      // Hide unnamed/duplicate contracts
      hideUnnamed: parseBool(q.hideUnnamed),

      // Cursor pagination
      limit,
      cursor,

      // Whether to calculate total count (service performs COUNT based on this value)
      includeTotal,
    };

    // Service call (keyset version; COUNT executed only when includeTotal=true)
    const result = await service.getAddressesByFilter(filters);
    const { data = [], nextCursor = null, totalCount = null, totalPages = null } = result || {};

    // Default response returns only hasNext
    const response = {
      limit,
      hasNext: !!nextCursor,
      nextCursor,  // Frontend encodes this object as base64 and sends as cursor for next request
      data,
    };

    // Include total information if includeTotal=true
    if (includeTotal) {
      response.totalCount = totalCount;
      response.totalPages = totalPages;
    }

    res.json(response);
  } catch (err) {
    console.error('getAddressesByFilter handler failed:', err);
    res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
};


// getAddress / getBridge removed


exports.getNetworkCounts = async (req, res) => {
  try {
    const map = await service.getNetworkCounts();
    res.json({ ok: true, networks: map });
  } catch (err) {
    console.error('getNetworkCounts failed:', err?.message || err);
    res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
}
