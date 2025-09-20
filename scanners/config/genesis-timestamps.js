/**
 * Genesis timestamps for various blockchain networks
 * Used when contracts return GENESIS_ prefixed transaction hashes
 */

const GENESIS_TIMESTAMPS = {
  // Mainnet
  1: {
    name: 'Ethereum',
    timestamp: 1438269973,  // July 30, 2015
    block: 0,
    date: '2015-07-30T15:26:13Z'
  },
  
  // L2s - Optimistic Rollups
  10: {
    name: 'Optimism',
    timestamp: 1636665385,  // November 11, 2021
    block: 0,
    date: '2021-11-11T21:16:25Z'
  },
  8453: {
    name: 'Base',
    timestamp: 1686789347,  // June 15, 2023
    block: 0,
    date: '2023-06-15T00:35:47Z'
  },
  
  // L2s - ZK Rollups
  42161: {
    name: 'Arbitrum One',
    timestamp: 1622243344,  // May 28, 2021
    block: 0,
    date: '2021-05-28T22:09:04Z'
  },
  
  // Sidechains
  137: {
    name: 'Polygon',
    timestamp: 1590824836,  // May 30, 2020
    block: 0,
    date: '2020-05-30T03:47:16Z'
  },
  56: {
    name: 'BSC',
    timestamp: 1598671449,  // August 29, 2020
    block: 0,
    date: '2020-08-29T03:24:09Z'
  },
  43114: {
    name: 'Avalanche',
    timestamp: 1600961380,  // September 24, 2020
    block: 0,
    date: '2020-09-24T16:09:40Z'
  },
  100: {
    name: 'Gnosis',
    timestamp: 1546605375,  // January 4, 2019
    block: 0,
    date: '2019-01-04T13:56:15Z'
  },
  
  // Newer L2s
  59144: {
    name: 'Linea',
    timestamp: 1689593539,  // July 17, 2023
    block: 0,
    date: '2023-07-17T11:52:19Z'
  },
  534352: {
    name: 'Scroll',
    timestamp: 1697031600,  // October 11, 2023
    block: 0,
    date: '2023-10-11T15:00:00Z'
  },
  5000: {
    name: 'Mantle',
    timestamp: 1687860000,  // June 27, 2023
    block: 0,
    date: '2023-06-27T10:00:00Z'
  },
  204: {
    name: 'opBNB',
    timestamp: 1691753542,  // August 11, 2023
    block: 0,
    date: '2023-08-11T13:12:22Z'
  },
  1101: {
    name: 'Polygon zkEVM',
    timestamp: 1679431200,  // March 21, 2023
    block: 0,
    date: '2023-03-21T18:00:00Z'
  },
  42170: {
    name: 'Arbitrum Nova',
    timestamp: 1656356400,  // June 27, 2022
    block: 0,
    date: '2022-06-27T19:00:00Z'
  },
  42220: {
    name: 'Celo',
    timestamp: 1587587365,  // April 22, 2020
    block: 0,
    date: '2020-04-22T22:29:25Z'
  },
  25: {
    name: 'Cronos',
    timestamp: 1636372800,  // November 8, 2021
    block: 0,
    date: '2021-11-08T12:00:00Z'
  },
  1284: {
    name: 'Moonbeam',
    timestamp: 1641945600,  // January 11, 2022
    block: 0,
    date: '2022-01-11T20:00:00Z'
  },
  1285: {
    name: 'Moonriver',
    timestamp: 1624372200,  // June 22, 2021
    block: 0,
    date: '2021-06-22T15:30:00Z'
  },
  
  // Testnets (optional, can be added as needed)
  11155111: {
    name: 'Sepolia',
    timestamp: 1655733600,  // June 20, 2022
    block: 0,
    date: '2022-06-20T14:00:00Z'
  }
};

/**
 * Get genesis timestamp for a given chain ID
 * @param {number} chainId - The chain ID
 * @returns {number|null} Genesis timestamp or null if not found
 */
function getGenesisTimestamp(chainId) {
  const genesis = GENESIS_TIMESTAMPS[chainId];
  return genesis ? genesis.timestamp : null;
}

/**
 * Get genesis info for a given chain ID
 * @param {number} chainId - The chain ID
 * @returns {Object|null} Genesis info object or null if not found
 */
function getGenesisInfo(chainId) {
  return GENESIS_TIMESTAMPS[chainId] || null;
}

/**
 * Add or update genesis timestamp for a network
 * @param {number} chainId - The chain ID
 * @param {Object} info - Genesis info (name, timestamp, block, date)
 */
function addGenesisTimestamp(chainId, info) {
  if (!info.timestamp) {
    throw new Error('Genesis timestamp is required');
  }
  
  GENESIS_TIMESTAMPS[chainId] = {
    name: info.name || `Chain ${chainId}`,
    timestamp: info.timestamp,
    block: info.block || 0,
    date: info.date || new Date(info.timestamp * 1000).toISOString()
  };
}

/**
 * Get all supported chain IDs
 * @returns {number[]} Array of chain IDs
 */
function getSupportedChainIds() {
  return Object.keys(GENESIS_TIMESTAMPS).map(id => parseInt(id));
}

/**
 * Check if a chain ID has genesis timestamp
 * @param {number} chainId - The chain ID
 * @returns {boolean} True if genesis timestamp exists
 */
function hasGenesisTimestamp(chainId) {
  return chainId in GENESIS_TIMESTAMPS;
}

module.exports = {
  GENESIS_TIMESTAMPS,
  getGenesisTimestamp,
  getGenesisInfo,
  addGenesisTimestamp,
  getSupportedChainIds,
  hasGenesisTimestamp
};