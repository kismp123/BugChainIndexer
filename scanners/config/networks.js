/**
 * Simplified Network Configuration
 * Centralized network settings with environment override support
 */

// Load environment variables from .env file
require('dotenv').config();

// Environment variable helper for arrays
const envArray = (name, fallback = []) => {
  const value = process.env[name];
  return value ? value.split(/[,\s]+/).filter(Boolean) : fallback;
};

// Alchemy API configuration
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || 'demo';

// Alchemy proxy configuration
const USE_ALCHEMY_PROXY = process.env.USE_ALCHEMY_PROXY === 'true';
const ALCHEMY_PROXY_URL = process.env.ALCHEMY_PROXY_URL || 'http://localhost:3001';

// Logs optimization configurations based on network activity tier and Alchemy tier
// IMPORTANT: Alchemy has a 10,000 logs per request limit
// targetLogsPerRequest set to 80-90% of limit for safety margin
//
// Tier-specific optimizations:
// - Free tier: 10 blocks per request limit
// - PAYG/Growth tier: Unlimited blocks (Ethereum/L2) or 2K-10K blocks (other chains)
//
// Density profiles (logs per block):
// - ultra-high-density: 150+ logs/block (Ethereum, Binance)
// - high-density: 50-150 logs/block (Polygon, Base)
// - medium-density: 20-50 logs/block (Optimism, Avalanche)
// - low-density: 5-20 logs/block (Arbitrum, Linea, Scroll, etc.)

const LOGS_OPTIMIZATION = {
  // ============================================
  // FREE TIER PROFILES (10 blocks per request)
  // ============================================

  'high-activity-free': {
    initialBatchSize: 10,        // Start at tier limit
    minBatchSize: 10,            // Cannot go below tier limit
    maxBatchSize: 10,            // Tier constraint
    targetDuration: 10000,        // 10 seconds acceptable response time
    targetLogsPerRequest: 8000,
    fastMultiplier: 1.0,         // No increase possible
    slowMultiplier: 1.0          // Keep at 10
  },

  'medium-activity-free': {
    initialBatchSize: 10,
    minBatchSize: 10,
    maxBatchSize: 10,
    targetDuration: 10000,        // 10 seconds acceptable response time
    targetLogsPerRequest: 8500,
    fastMultiplier: 1.0,
    slowMultiplier: 1.0
  },

  'low-activity-free': {
    initialBatchSize: 10,
    minBatchSize: 10,
    maxBatchSize: 10,
    targetDuration: 8000,
    targetLogsPerRequest: 9000,
    fastMultiplier: 1.0,
    slowMultiplier: 1.0
  },

  // ============================================
  // PAYG/GROWTH TIER PROFILES (Large batches)
  // ============================================

  'high-activity-payg': {
    initialBatchSize: 100,       // Conservative start
    minBatchSize: 20,            // Allow smaller if needed
    maxBatchSize: 1000,          // Increased for efficiency
    targetDuration: 10000,        // 10 seconds acceptable response time
    targetLogsPerRequest: 8000,
    fastMultiplier: 1.5,
    slowMultiplier: 0.7
  },

  'high-activity-premium': {   // Alias for payg
    initialBatchSize: 100,
    minBatchSize: 20,
    maxBatchSize: 1000,
    targetDuration: 10000,        // 10 seconds acceptable response time
    targetLogsPerRequest: 8000,
    fastMultiplier: 1.5,
    slowMultiplier: 0.7
  },

  'medium-activity-payg': {
    initialBatchSize: 500,       // Larger initial batch
    minBatchSize: 50,
    maxBatchSize: 3000,          // Increased for efficiency
    targetDuration: 10000,        // 10 seconds acceptable response time
    targetLogsPerRequest: 8500,
    fastMultiplier: 2.0,
    slowMultiplier: 0.8
  },

  'medium-activity-premium': {
    initialBatchSize: 500,
    minBatchSize: 50,
    maxBatchSize: 3000,
    targetDuration: 10000,        // 10 seconds acceptable response time
    targetLogsPerRequest: 8500,
    fastMultiplier: 2.0,
    slowMultiplier: 0.8
  },

  'low-activity-payg': {
    initialBatchSize: 2000,      // Large initial batch
    minBatchSize: 500,
    maxBatchSize: 10000,         // Very large for low-activity chains
    targetDuration: 8000,
    targetLogsPerRequest: 9000,
    fastMultiplier: 3.0,
    slowMultiplier: 0.9
  },

  'low-activity-premium': {
    initialBatchSize: 2000,
    minBatchSize: 500,
    maxBatchSize: 10000,
    targetDuration: 8000,
    targetLogsPerRequest: 9000,
    fastMultiplier: 3.0,
    slowMultiplier: 0.9
  },

  // ============================================
  // DENSITY-BASED PROFILES (More granular optimization)
  // ============================================

  // Ultra-high density: 150+ logs/block (Ethereum, Binance)
  'ultra-high-density-free': {
    initialBatchSize: 10,
    minBatchSize: 10,
    maxBatchSize: 10,
    targetDuration: 10000,        // 10 seconds acceptable response time
    targetLogsPerRequest: 9000,   // Expanded to 9K (90% of Alchemy limit)
    fastMultiplier: 1.0,
    slowMultiplier: 1.0
  },

  'ultra-high-density-payg': {
    initialBatchSize: 50,         // Start smaller than high-density
    minBatchSize: 10,
    maxBatchSize: 200,            // Increased max for longer acceptable duration
    targetDuration: 10000,        // 10 seconds acceptable response time
    targetLogsPerRequest: 9000,   // Expanded to 9K (90% of Alchemy limit)
    fastMultiplier: 1.5,          // Can increase more aggressively
    slowMultiplier: 0.7
  },

  'ultra-high-density-premium': {
    initialBatchSize: 50,
    minBatchSize: 10,
    maxBatchSize: 200,            // Increased max for longer acceptable duration
    targetDuration: 10000,        // 10 seconds acceptable response time
    targetLogsPerRequest: 9000,   // Expanded to 9K (90% of Alchemy limit)
    fastMultiplier: 1.5,          // Can increase more aggressively
    slowMultiplier: 0.7
  },

  // High density: 50-150 logs/block (Polygon, Base)
  'high-density-free': {
    initialBatchSize: 10,
    minBatchSize: 10,
    maxBatchSize: 10,
    targetDuration: 10000,        // 10 seconds acceptable response time
    targetLogsPerRequest: 7500,
    fastMultiplier: 1.0,
    slowMultiplier: 1.0
  },

  'high-density-payg': {
    initialBatchSize: 100,
    minBatchSize: 20,
    maxBatchSize: 500,            // Moderate max
    targetDuration: 10000,        // 10 seconds acceptable response time
    targetLogsPerRequest: 7500,
    fastMultiplier: 1.4,
    slowMultiplier: 0.7
  },

  'high-density-premium': {
    initialBatchSize: 100,
    minBatchSize: 20,
    maxBatchSize: 500,
    targetDuration: 10000,        // 10 seconds acceptable response time
    targetLogsPerRequest: 7500,
    fastMultiplier: 1.4,
    slowMultiplier: 0.7
  },

  // Medium density: 20-50 logs/block (Optimism, Avalanche)
  'medium-density-free': {
    initialBatchSize: 10,
    minBatchSize: 10,
    maxBatchSize: 10,
    targetDuration: 10000,        // 10 seconds acceptable response time
    targetLogsPerRequest: 8500,
    fastMultiplier: 1.0,
    slowMultiplier: 1.0
  },

  'medium-density-payg': {
    initialBatchSize: 300,
    minBatchSize: 50,
    maxBatchSize: 2000,
    targetDuration: 10000,        // 10 seconds acceptable response time
    targetLogsPerRequest: 8500,
    fastMultiplier: 1.8,
    slowMultiplier: 0.8
  },

  'medium-density-premium': {
    initialBatchSize: 300,
    minBatchSize: 50,
    maxBatchSize: 2000,
    targetDuration: 10000,        // 10 seconds acceptable response time
    targetLogsPerRequest: 8500,
    fastMultiplier: 1.8,
    slowMultiplier: 0.8
  },

  // Low density: 5-20 logs/block (Arbitrum, Linea, Scroll, etc.)
  'low-density-free': {
    initialBatchSize: 10,
    minBatchSize: 10,
    maxBatchSize: 10,
    targetDuration: 10000,        // 10 seconds acceptable response time
    targetLogsPerRequest: 9000,
    fastMultiplier: 1.0,
    slowMultiplier: 1.0
  },

  'low-density-payg': {
    initialBatchSize: 1000,       // Start large for low-density chains
    minBatchSize: 200,
    maxBatchSize: 10000,          // Very large batches possible (10K block limit)
    targetDuration: 10000,        // 10 seconds acceptable response time
    targetLogsPerRequest: 9000,
    fastMultiplier: 2.5,
    slowMultiplier: 0.9
  },

  'low-density-premium': {
    initialBatchSize: 1000,
    minBatchSize: 200,
    maxBatchSize: 10000,          // Very large batches possible (10K block limit)
    targetDuration: 10000,        // 10 seconds acceptable response time
    targetLogsPerRequest: 9000,
    fastMultiplier: 2.5,
    slowMultiplier: 0.9
  },

  // ============================================
  // LEGACY PROFILES (For backward compatibility)
  // These map to density profiles for existing configurations
  // ============================================

  'high-activity': {
    initialBatchSize: 100,
    minBatchSize: 10,
    maxBatchSize: 500,
    targetDuration: 10000,        // 10 seconds acceptable response time
    targetLogsPerRequest: 8000,
    fastMultiplier: 1.5,
    slowMultiplier: 0.7
  },

  'medium-activity': {
    initialBatchSize: 500,
    minBatchSize: 50,
    maxBatchSize: 2000,
    targetDuration: 10000,        // 10 seconds acceptable response time
    targetLogsPerRequest: 8500,
    fastMultiplier: 2.0,
    slowMultiplier: 0.8
  },

  'low-activity': {
    initialBatchSize: 2000,
    minBatchSize: 500,
    maxBatchSize: 10000,
    targetDuration: 8000,
    targetLogsPerRequest: 9000,
    fastMultiplier: 3.0,
    slowMultiplier: 0.9
  }
};

/**
 * Get optimized logs configuration based on activity profile and detected Alchemy tier
 * @param {string} activityProfile - 'high-activity', 'medium-activity', or 'low-activity'
 * @param {string} alchemyTier - 'free', 'payg', 'premium', or 'growth'
 * @returns {object} Optimized configuration for the given profile and tier
 */
const getLogsOptimization = (activityProfile, alchemyTier) => {
  // Normalize tier names (payg, growth, premium all use same config)
  const normalizedTier = (alchemyTier === 'free') ? 'free' : 'payg';

  // Try different tier variants in order of preference
  const tierVariants = [
    `${activityProfile}-${alchemyTier}`,  // Try exact match first (e.g., high-activity-premium)
    `${activityProfile}-${normalizedTier}` // Then try normalized (e.g., high-activity-payg)
  ];

  // Try each variant
  for (const variant of tierVariants) {
    if (LOGS_OPTIMIZATION[variant]) {
      return LOGS_OPTIMIZATION[variant];
    }
  }

  // Fallback to legacy profile (for backward compatibility)
  if (LOGS_OPTIMIZATION[activityProfile]) {
    return LOGS_OPTIMIZATION[activityProfile];
  }

  // Final fallback to medium-activity
  console.warn(`Unknown activity profile: ${activityProfile}, falling back to medium-activity`);
  return LOGS_OPTIMIZATION[`medium-activity-${normalizedTier}`] || LOGS_OPTIMIZATION['medium-activity'];
};

// Helper function to generate Alchemy URL or proxy URL
const getAlchemyUrl = (network) => {
  // If Alchemy proxy is enabled, return proxy URL
  if (USE_ALCHEMY_PROXY) {
    return `${ALCHEMY_PROXY_URL}/rpc/${network}`;
  }
  
  // Otherwise use direct Alchemy API
  const networkMap = {
    'ethereum': 'eth-mainnet',
    'polygon': 'polygon-mainnet',
    'arbitrum': 'arb-mainnet',
    'optimism': 'opt-mainnet',
    'base': 'base-mainnet',
    'binance': 'bnb-mainnet',  // BNB Smart Chain
    'avalanche': 'avax-mainnet',  // Avalanche C-Chain
    'polygon-zkevm': 'polygonzkevm-mainnet',  // Polygon zkEVM
    'linea': 'linea-mainnet',  // Linea
    'scroll': 'scroll-mainnet',  // Scroll
    'mantle': 'mantle-mainnet',  // Mantle
    'arbitrum-nova': 'arbnova-mainnet',  // Arbitrum Nova
    'moonbeam': 'moonbeam-mainnet',  // Moonbeam
    'gnosis': 'gnosis-mainnet',  // Gnosis (xDAI)
    'celo': 'celo-mainnet'  // Celo
  };
  
  const alchemyNetwork = networkMap[network];
  if (!alchemyNetwork) return null;
  
  return `https://${alchemyNetwork}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;
};

// Default API keys - now loaded from environment variables
const DEFAULT_ETHERSCAN_KEYS = envArray('DEFAULT_ETHERSCAN_KEYS', []);

// Script timeout settings (seconds)
const TIMEOUT_SECONDS = 7200;
const TIMEOUT_KILL_AFTER = 15;

// Network configurations
const NETWORKS = {
  ethereum: {
    chainId: 1,
    name: 'Ethereum Mainnet',
    alchemyNetwork: 'eth-mainnet',

    rpcUrls: envArray('ETHEREUM_RPC_URL', [
      // Alchemy RPC (prioritized for reliability)
      getAlchemyUrl('ethereum'),
      'https://eth.llamarpc.com',
      'https://ethereum-rpc.publicnode.com',
      'https://1rpc.io/eth',
      'https://rpc.mevblocker.io',
      'https://rpc.flashbots.net',
      'https://eth.meowrpc.com',
      'https://eth.drpc.org',
      'https://endpoints.omniatech.io/v1/eth/mainnet/public',
      'https://cloudflare-eth.com',
      'https://ethereum.blockpi.network/v1/rpc/public',
      'https://eth-mainnet.public.blastapi.io',
      'https://api.securerpc.com/v1',
      'https://virginia.rpc.blxrbdn.com',
      'https://uk.rpc.blxrbdn.com',
      'https://singapore.rpc.blxrbdn.com',
      'https://eth.api.onfinality.io/public',
      'https://core.gashawk.io/rpc',
      // Additional RPC endpoints from chainlist.org
      // Note: Some endpoints removed due to persistent errors:
      // - rpc.builder0x69.io (DNS not found)
      // - api.stateless.solutions (SSL certificate issue)
      'https://eth.merkle.io',
      'https://rpc.lokibuilder.xyz/wallet',
      'https://rpc.polysplit.cloud/v1/chain/1',
      'https://rpc.nodifi.ai/api/rpc/free',
      'https://rpc.public.curie.radiumblock.co/http/ethereum',
      'https://eth.blockrazor.xyz',
      'https://ethereum.therpc.io',
      'https://ethereum-json-rpc.stakely.io',
      'https://rpc.eth.gateway.fm'
    ].filter(Boolean)),
    apiKeys: DEFAULT_ETHERSCAN_KEYS,
    contractValidator: '0xfE53a230a2AEd6E52f2dEf488DA408d47a80A8bF',
    nativeCurrency: 'ETH',
    BalanceHelper: '0xF6eDe5F60e6fB769F7571Ad635bF1Db0735a7386',
    // Alchemy getLogs block range limits
    maxLogsBlockRange: {
      free: 10,          // Free tier
      premium: 999999    // Premium/PAYG/Growth tier (unlimited for Ethereum)
    },
    // Logs optimization configuration
    // Ethereum has ultra-high log density (150+ logs/block)
    // Use string profile name, Scanner will apply tier-specific optimization
    logsOptimization: 'ultra-high-density'
  },

  binance: {
    chainId: 56,
    name: 'BNB Smart Chain',
    alchemyNetwork: 'bnb-mainnet',

    rpcUrls: envArray('BSC_RPC_URL', [
      // Alchemy RPC for BNB Smart Chain
      getAlchemyUrl('binance'),
      'https://1rpc.io/bnb',
      'https://bsc.meowrpc.com',
      'https://bsc-rpc.publicnode.com',
      'https://endpoints.omniatech.io/v1/bsc/mainnet/public',
      'https://rpc.polysplit.cloud/v1/chain/56',
      'https://binance.llamarpc.com',
      'https://bsc.blockpi.network/v1/rpc/public',
      'https://bnb.api.onfinality.io/public',
      'https://bsc-dataseed1.bnbchain.org',
      'https://bsc-dataseed2.bnbchain.org',
      'https://bsc-dataseed3.bnbchain.org',
      'https://bsc-dataseed4.bnbchain.org',
      'https://bsc-dataseed1.defibit.io',
      'https://bsc-dataseed2.defibit.io',
      'https://bsc-dataseed3.defibit.io',
      'https://bsc-dataseed4.defibit.io',
      'https://bsc-dataseed1.ninicoin.io',
      'https://bsc-dataseed2.ninicoin.io',
      'https://bsc.drpc.org',
    ].filter(Boolean)),
    apiKeys: DEFAULT_ETHERSCAN_KEYS,
    contractValidator: '0x91Ce20223F35b82E34aC4913615845C7AaA0e2B7',
    nativeCurrency: 'BNB',
    BalanceHelper: '0xf481b013532d38227F57f46217B3696F2Ae592c8',
    maxLogsBlockRange: {
      free: 10,
      premium: 10000     // BSC: 10000 blocks
    },
    // BSC has ultra-high log density similar to Ethereum
    logsOptimization: 'ultra-high-density'
  },

  polygon: {
    chainId: 137,
    name: 'Polygon',
    alchemyNetwork: 'polygon-mainnet',

    rpcUrls: envArray('POLYGON_RPC_URL', [
      // Alchemy RPC
      getAlchemyUrl('polygon'),
      'https://1rpc.io/matic',
      'https://polygon-bor-rpc.publicnode.com',
      'https://polygon.drpc.org',
      'https://polygon.meowrpc.com',
      'https://endpoints.omniatech.io/v1/matic/mainnet/public',
      'https://polygon-public.nodies.app',
      'https://polygon-mainnet.public.blastapi.io',
      'https://polygon.llamarpc.com',
      'https://polygon-rpc.com',
      'https://rpc-mainnet.matic.network',
      'https://rpc-mainnet.maticvigil.com',
      'https://rpc-mainnet.matic.quiknode.pro',
      'https://polygon-mainnet.g.alchemy.com/v2/demo',
      'https://polygon.blockpi.network/v1/rpc/public',
      'https://polygon.gateway.tenderly.co',
      'https://polygon.api.onfinality.io/public',
      'https://gateway.tenderly.co/public/polygon',
      'https://polygon-mainnet.rpcfast.com?api_key=xbhWBI1Wkguk8SNMu1bvvLurPGLXmgwYeC4S6g2H7WdwFigZSmPWVZRxrskEQwIf'
    ].filter(Boolean)),
    apiKeys: DEFAULT_ETHERSCAN_KEYS,
    contractValidator: '0xC7bAd40fE8c4B8aA380cBfAE63B9b39a9684F8B4',
    nativeCurrency: 'MATIC',
    BalanceHelper: '0xC55d7D06b3651816ea51700CB91235cd60Dd4d7D',
    maxLogsBlockRange: {
      free: 10,
      premium: 2000      // Polygon: 2000 blocks
    },
    // Polygon has high log density (50-150 logs/block)
    logsOptimization: 'high-density'
  },

  arbitrum: {
    chainId: 42161,
    name: 'Arbitrum One',
    alchemyNetwork: 'arb-mainnet',

    rpcUrls: envArray('ARBITRUM_RPC_URL', [
      // Alchemy RPC
      getAlchemyUrl('arbitrum'),
      'https://1rpc.io/arb',
      'https://arbitrum-one-rpc.publicnode.com',
      'https://arbitrum.meowrpc.com',
      'https://arbitrum.drpc.org',
      'https://api.stateless.solutions/arbitrum-one/v1/demo',
      'https://arbitrum-one.public.nodies.app',
      'https://arbitrum.blockpi.network/v1/rpc/public',
      'https://arbitrum-one.public.blastapi.io',
      'https://arb1.arbitrum.io/rpc',
      'https://arbitrum.llamarpc.com',
      'https://endpoints.omniatech.io/v1/arbitrum/one/public',
      'https://arb-mainnet.g.alchemy.com/v2/demo',
      'https://arbitrum-mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
      'https://arb-mainnet-public.unifra.io',
      'https://arbitrum.gateway.tenderly.co',
      'https://gateway.tenderly.co/public/arbitrum',
      'https://arbitrum-one.publicnode.com',
      'https://api.zan.top/node/v1/arb/one/public'
    ].filter(Boolean)),
    apiKeys: DEFAULT_ETHERSCAN_KEYS,
    contractValidator: '0x20f776Bd5FA50822fb872573C80453dA18A8CA34',
    nativeCurrency: 'ETH',
    BalanceHelper: '0xdD5cFc64f74B2b5A4e80031DDf84597be449E3E3',
    maxLogsBlockRange: {
      free: 10,
      premium: 999999    // Arbitrum (Layer 2): unlimited
    },
    // Arbitrum has low log density (5-20 logs/block)
    logsOptimization: 'low-density'
  },

  optimism: {
    chainId: 10,
    name: 'Optimism',
    alchemyNetwork: 'opt-mainnet',

    rpcUrls: envArray('OPTIMISM_RPC_URL', [
      // Alchemy RPC
      getAlchemyUrl('optimism'),
      'https://1rpc.io/op',
      'https://optimism-rpc.publicnode.com',
      'https://optimism.meowrpc.com',
      'https://api.stateless.solutions/optimism/v1/demo',
      'https://endpoints.omniatech.io/v1/op/mainnet/public',
      'https://optimism.public.blastapi.io',
      'https://optimism-public.nodies.app',
      'https://optimism.api.onfinality.io/public',
      'https://mainnet.optimism.io',
      'https://optimism.llamarpc.com',
      'https://optimism.drpc.org',
      'https://optimism.blockpi.network/v1/rpc/public',
      'https://opt-mainnet.g.alchemy.com/v2/demo',
      'https://optimism-mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
      'https://optimism.gateway.tenderly.co',
      'https://gateway.tenderly.co/public/optimism',
      'https://optimism-mainnet.public.blastapi.io',
      'https://optimism.publicnode.com',
      'https://api.zan.top/node/v1/opt/mainnet/public'
    ].filter(Boolean)),
    apiKeys: DEFAULT_ETHERSCAN_KEYS,
    contractValidator: '0xeAbB01920C41e1C010ba74628996EEA65Df03550',
    nativeCurrency: 'ETH',
    BalanceHelper: '0x3d2104Da2B23562c47DCAE9EefE5063b6aB5c637',
    maxLogsBlockRange: {
      free: 10,
      premium: 999999    // Optimism (Layer 2): unlimited
    },
    // Optimism has medium log density (20-50 logs/block)
    logsOptimization: 'medium-density'
  },

  base: {
    chainId: 8453,
    name: 'Base',
    alchemyNetwork: 'base-mainnet',

    rpcUrls: envArray('BASE_RPC_URL', [
      // Alchemy RPC
      getAlchemyUrl('base'),
      'https://base.llamarpc.com',
      'https://1rpc.io/base',
      'https://base.meowrpc.com',
      'https://base-rpc.publicnode.com',
      'https://base.drpc.org',
      'https://base.blockpi.network/v1/rpc/public',
      'https://base-public.nodies.app',
      'https://base.gateway.tenderly.co',
      'https://mainnet.base.org',
      'https://developer-access-mainnet.base.org',
      'https://base-mainnet.diamondswap.org/rpc',
      'https://rpc.notadegen.com/base',
      'https://base-mainnet.public.blastapi.io',
      'https://endpoints.omniatech.io/v1/base/mainnet/public',
      'https://base-pokt.nodies.app',
      'https://base.publicnode.com',
      'https://gateway.tenderly.co/public/base',
      'https://base-mainnet-rpc.allthatnode.com',
    ].filter(Boolean)),
    apiKeys: DEFAULT_ETHERSCAN_KEYS,
    contractValidator: '0x6F4A97C44669a74Ee6b6EE95D2cD6C4803F6b384',
    nativeCurrency: 'ETH',
    BalanceHelper: '0xa3ba28ccDDa4Ba986F20E395D41F5bb37F8f900d',
    maxLogsBlockRange: {
      free: 10,
      premium: 999999    // Base (Layer 2): unlimited
    },
    // Base has high log density (50-150 logs/block)
    logsOptimization: 'high-density'
  },

  avalanche: {
    chainId: 43114,
    name: 'Avalanche C-Chain',
    alchemyNetwork: 'avax-mainnet',

    rpcUrls: envArray('AVALANCHE_RPC_URL', [
      // Public RPCs first (Alchemy AVAX not enabled on free tier)
      'https://avalanche-c-chain-rpc.publicnode.com',
      'https://api.avax.network/ext/bc/C/rpc',
      'https://1rpc.io/avax/c',
      'https://endpoints.omniatech.io/v1/avax/mainnet/public',
      'https://avax.meowrpc.com',
      'https://avalanche.drpc.org',
      'https://avalanche-mainnet.public.nodies.app',
      'https://avalanche.blockpi.network/v1/rpc/public',
      'https://ava-mainnet.public.blastapi.io/ext/bc/C/rpc',
      'https://avalancheapi.terminet.io/ext/bc/C/rpc',
      'https://avalanche-evm.publicnode.com',
      'https://avalanche.public.blastapi.io',
      'https://avalanche.api.onfinality.io/public/ext/bc/C/rpc',
      'https://avax.network/ext/bc/C/rpc',
      'https://blastapi.io/public-api/avalanche',
      // Alchemy RPC (last fallback - requires AVAX enabled in dashboard)
      getAlchemyUrl('avalanche')
    ].filter(Boolean)),
    apiKeys: DEFAULT_ETHERSCAN_KEYS,
    contractValidator: '0x235a064473515789e2781B051bbd9e24AFb46DAc',
    nativeCurrency: 'AVAX',
    BalanceHelper: '0xa3ba28ccDDa4Ba986F20E395D41F5bb37F8f900d',
    maxLogsBlockRange: {
      free: 10,
      premium: 10000     // All Other Chains: 10000 blocks
    },
    // Avalanche has medium log density (20-50 logs/block)
    logsOptimization: 'medium-density'
  }
};

// Additional networks with proper configurations
const ADDITIONAL_NETWORKS = {
  gnosis: {
    chainId: 100,
    name: 'Gnosis Chain',
    alchemyNetwork: 'gnosis-mainnet',

    rpcUrls: envArray('GNOSIS_RPC_URL', [
      getAlchemyUrl('gnosis'),
      'https://gnosis.drpc.org',
      'https://endpoints.omniatech.io/v1/gnosis/mainnet/public',
      'https://gnosis-rpc.publicnode.com',
      'https://1rpc.io/gnosis',
      'https://gnosis-public.nodies.app',
      'https://gnosis.blockpi.network/v1/rpc/public',
      'https://gnosis.therpc.io'
    ].filter(Boolean)),
    contractValidator: '0x06318Df33cea02503afc45FE65cdEAb8FAb3E20A',
    nativeCurrency: 'xDAI',
    BalanceHelper: '0x510E86Be47994b0Fbc9aEF854B83d2f8906F7AD7',
    maxLogsBlockRange: {
      free: 10,
      premium: 10000     // All Other Chains: 10000 blocks
    },
    // Gnosis has low log density (5-20 logs/block)
    logsOptimization: 'low-density'
  },

  linea: {
    chainId: 59144,
    name: 'Linea',
    alchemyNetwork: 'linea-mainnet',

    rpcUrls: envArray('LINEA_RPC_URL', [
      getAlchemyUrl('linea'),
      'https://rpc.linea.build',
      'https://1rpc.io/linea',
      'https://linea.drpc.org',
      'https://linea.decubate.com',
      'https://linea.publicnode.com'
    ].filter(Boolean)),
    contractValidator: '0xeabb01920c41e1c010ba74628996eea65df03550',
    nativeCurrency: 'ETH',
    BalanceHelper: '0x06318Df33cea02503afc45FE65cdEAb8FAb3E20A',
    maxLogsBlockRange: {
      free: 10,
      premium: 10000     // All Other Chains: 10000 blocks
    },
    // Linea has low log density (5-20 logs/block)
    logsOptimization: 'low-density'
  },

  scroll: {
    chainId: 534352,
    name: 'Scroll',
    alchemyNetwork: 'scroll-mainnet',

    rpcUrls: envArray('SCROLL_RPC_URL', [
      getAlchemyUrl('scroll'),
      'https://rpc.scroll.io',
      'https://1rpc.io/scroll',
      'https://scroll.drpc.org',
      'https://endpoints.omniatech.io/v1/scroll/mainnet/public',
      'https://scroll-mainnet.public.blastapi.io',
      'https://scroll-mainnet.unifra.io'
    ].filter(Boolean)),
    contractValidator: '0xeAbB01920C41e1C010ba74628996EEA65Df03550',
    nativeCurrency: 'ETH',
    BalanceHelper: '0x06318Df33cea02503afc45FE65cdEAb8FAb3E20A',
    maxLogsBlockRange: {
      free: 10,
      premium: 10000     // All Other Chains: 10000 blocks
    },
    // Scroll has low log density (5-20 logs/block)
    logsOptimization: 'low-density'
  },

  mantle: {
    chainId: 5000,
    name: 'Mantle',
    alchemyNetwork: 'mantle-mainnet',

    rpcUrls: envArray('MANTLE_RPC_URL', [
      getAlchemyUrl('mantle'),
      'https://rpc.mantle.xyz',
      'https://mantle-rpc.publicnode.com',
      'https://mantle.drpc.org',
      'https://1rpc.io/mantle',
      'https://endpoints.omniatech.io/v1/mantle/mainnet/public'
    ].filter(Boolean)),
    contractValidator: '0x235a064473515789e2781B051bbd9e24AFb46DAc',
    nativeCurrency: 'MNT',
    BalanceHelper: '0xeAbB01920C41e1C010ba74628996EEA65Df03550',
    maxLogsBlockRange: {
      free: 10,
      premium: 10000     // All Other Chains: 10000 blocks
    },
    // Mantle has low log density (5-20 logs/block)
    logsOptimization: 'low-density'
  },

  unichain: {
    chainId: 1301,
    name: 'Unichain',
    alchemyNetwork: 'unichain-mainnet',

    rpcUrls: envArray('UNICHAIN_RPC_URL', [
      'https://mainnet.unichain.org',
      'https://unichain-rpc.publicnode.com',
      'https://unichain.drpc.org',
      'https://1rpc.io/unichain',
      'https://rpc.unichain.org',
      'https://unichain.gateway.tenderly.co'
    ].filter(Boolean)),
    contractValidator: '0x235a064473515789e2781B051bbd9e24AFb46DAc',
    nativeCurrency: 'ETH',
    BalanceHelper: '0x6F4A97C44669a74Ee6b6EE95D2cD6C4803F6b384',
    maxLogsBlockRange: {
      free: 10,
      premium: 10000     // All Other Chains: 10000 blocks
    },
    // Unichain has low log density (5-20 logs/block)
    logsOptimization: 'low-density'
  },

  berachain: {
    chainId: 80084,
    name: 'Berachain',
    alchemyNetwork: 'berachain-mainnet',

    rpcUrls: envArray('BERACHAIN_RPC_URL', [
      'https://rpc.berachain.com',
      'https://berachain.drpc.org',
      'https://1rpc.io/berachain',
      'https://bartio.rpc.berachain.com',
      'https://berachain-rpc.publicnode.com',
      'https://bera.rpc.thirdweb.com'
    ].filter(Boolean)),
    contractValidator: '0x235a064473515789e2781B051bbd9e24AFb46DAc',
    nativeCurrency: 'BERA',
    BalanceHelper: '0x6F4A97C44669a74Ee6b6EE95D2cD6C4803F6b384',
    maxLogsBlockRange: {
      free: 10,
      premium: 10000     // All Other Chains: 10000 blocks
    },
    // Berachain has low log density (5-20 logs/block)
    logsOptimization: 'low-density'
  },

  sui: {
    chainId: 0, // Sui doesn't use EVM chainId
    name: 'Sui Network',
    chainType: 'move', // Non-EVM blockchain
    suiNetwork: 'mainnet',

    rpcUrls: envArray('SUI_RPC_URL', [
      `https://sui-mainnet.alchemy-blast.com/v2/${ALCHEMY_API_KEY}`,
      'https://fullnode.mainnet.sui.io:443'
    ].filter(Boolean)),
    nativeCurrency: 'SUI',
    // Sui-specific: no contract validator or balance helper (Move blockchain)
    maxLogsBlockRange: {
      free: 1000,        // Events per query
      premium: 1000      // Sui max events per query
    }
  }
};


// Apply configuration to additional networks
Object.entries(ADDITIONAL_NETWORKS).forEach(([key, config]) => {
  NETWORKS[key] = {
    ...config,
    apiKeys: DEFAULT_ETHERSCAN_KEYS
  };
});

// Global settings
const CONFIG = {
  // Time settings (in hours/days) - can be overridden by env vars
  TIMEDELAY: parseInt(process.env.TIMEDELAY_HOURS || '4', 10),
  FUNDUPDATEDELAY: parseInt(process.env.FUNDUPDATEDELAY_DAYS || '7', 10),
  
  // Script timeout settings
  TIMEOUT_SECONDS: parseInt(process.env.TIMEOUT_SECONDS || TIMEOUT_SECONDS.toString(), 10),
  TIMEOUT_KILL_AFTER: parseInt(process.env.TIMEOUT_KILL_AFTER || TIMEOUT_KILL_AFTER.toString(), 10),
  
  // API settings
  etherscanApiKeys: DEFAULT_ETHERSCAN_KEYS,
  
  // Database settings (still from env vars for security)
  database: {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    database: process.env.PGDATABASE || 'bugchain_indexer', 
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || ''
  },
  
  // Advanced options
  runFixDeployed: process.env.RUN_FIX_DEPLOYED === 'true',
  runVerifyContracts: process.env.RUN_VERIFY_CONTRACTS !== 'false', // Default true
  
  // Add all networks
  ...NETWORKS
};

module.exports = {
  NETWORKS,
  CONFIG,
  LOGS_OPTIMIZATION,
  getLogsOptimization
};