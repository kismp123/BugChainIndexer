const service = require('../services/approval.service');
const { parseNumber, parseStringArray, decodeCursor } = require('../utils/parsers');

exports.getApprovals = async (req, res) => {
  try {
    const q = { ...req.query, ...req.body };

    const MAX_LIMIT = 200;
    const limit = Math.min(Math.max(parseNumber(q.limit) ?? 50, 1), MAX_LIMIT);
    const cursor = decodeCursor(q.cursor);

    const filters = {
      networks: parseStringArray(q.networks),
      spender: q.spender ? String(q.spender).trim().toLowerCase() : null,
      owner: q.owner ? String(q.owner).trim().toLowerCase() : null,
      tokenAddress: q.tokenAddress ? String(q.tokenAddress).trim().toLowerCase() : null,
      limit,
      cursor
    };

    const result = await service.getApprovalsByFilter(filters);

    res.json({
      limit: result.limit,
      hasNext: result.hasNext,
      nextCursor: result.nextCursor,
      data: result.data
    });
  } catch (err) {
    console.error('getApprovals handler failed:', err);
    res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
};

exports.getApprovalStats = async (req, res) => {
  try {
    const network = req.query.network || null;
    const stats = await service.getApprovalStats(network);
    res.json({ ok: true, stats });
  } catch (err) {
    console.error('getApprovalStats failed:', err?.message || err);
    res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
};
