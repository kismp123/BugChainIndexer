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
    'avalanche': 'avalanche-mainnet',  // Avalanche C-Chain
    'polygon-zkevm': 'polygonzkevm-mainnet',  // Polygon zkEVM
    'linea': 'linea-mainnet',  // Linea
    'scroll': 'scroll-mainnet',  // Scroll
    'mantle': 'mantle-mainnet',  // Mantle
    'arbitrum-nova': 'arbnova-mainnet',  // Arbitrum Nova
    'moonbeam': 'moonbeam-mainnet',  // Moonbeam
    'gnosis': 'gnosis-mainnet',  // Gnosis (xDAI)
    'opbnb': 'opbnb-mainnet',  // opBNB
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
      'https://core.gashawk.io/rpc'
    ].filter(Boolean)),
    apiKeys: DEFAULT_ETHERSCAN_KEYS,
    contractValidator: '0xfE53a230a2AEd6E52f2dEf488DA408d47a80A8bF',
    BalanceHelper: '0x5CD47B1F62e3BD40C669024CA52B40946C8b641b',
    nativeCurrency: 'ETH'
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
    BalanceHelper: '0x5B9a623Fc8eDFE96B9504B6B801EF439c8acc333',
    nativeCurrency: 'BNB'
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
    BalanceHelper: '0x1af03A9a9c7F1D3Ed1E7900d9f76F09EE01B0344',
    nativeCurrency: 'MATIC'
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
    BalanceHelper: '0x04eD457F1A445f2a90132028C2A0Cfa09e823bEc',
    nativeCurrency: 'ETH'
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
    BalanceHelper: '0x06318Df33cea02503afc45FE65cdEAb8FAb3E20A',
    nativeCurrency: 'ETH'
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
    BalanceHelper: '0x235a064473515789e2781B051bbd9e24AFb46DAc',
    nativeCurrency: 'ETH'
  },

  avalanche: {
    chainId: 43114,
    name: 'Avalanche C-Chain',
    alchemyNetwork: 'avalanche-mainnet',

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
    BalanceHelper: '0x6F4A97C44669a74Ee6b6EE95D2cD6C4803F6b384',
    nativeCurrency: 'AVAX'
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
    nativeCurrency: 'xDAI'
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
    nativeCurrency: 'ETH'
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
    nativeCurrency: 'ETH'
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
    nativeCurrency: 'MNT'
  },
  
  opbnb: {
    chainId: 204,
    name: 'opBNB',
    alchemyNetwork: 'opbnb-mainnet',

    rpcUrls: envArray('OPBNB_RPC_URL', [
      getAlchemyUrl('opbnb'),
      'https://opbnb-mainnet-rpc.bnbchain.org',
      'https://opbnb-rpc.publicnode.com',
      'https://1rpc.io/opbnb',
      'https://opbnb.drpc.org',
      'https://opbnb-mainnet.nodereal.io/v1/64a9df0874fb4a93b9d0a3849de012d3'
    ].filter(Boolean)),
    contractValidator: '0xa3ba28ccdda4ba986f20e395d41f5bb37f8f900d',
    nativeCurrency: 'BNB'
  }
};

// Disabled networks (no contractValidator deployed)
// These networks are disabled until contractValidator contracts are deployed
const DISABLED_NETWORKS = {
  'polygon-zkevm': {
    chainId: 1101,
    name: 'Polygon zkEVM',
    alchemyNetwork: 'polygonzkevm-mainnet',
    reason: 'No contractValidator deployed',
    rpcUrls: envArray('POLYGON_ZKEVM_RPC_URL', [
      getAlchemyUrl('polygon-zkevm'),
      'https://1rpc.io/polygon/zkevm',
      'https://polygon-zkevm.drpc.org',
      'https://node.histori.xyz/polygon-zkevm-mainnet/8ry9f6t9dct1se2hlagxnd9n2a',
      'https://endpoints.omniatech.io/v1/polygon-zkevm/mainnet/public',
      'https://polygon-zkevm-public.nodies.app',
      'https://polygon-zkevm-mainnet.public.blastapi.io'
    ].filter(Boolean)),
    nativeCurrency: 'ETH'
  },

  'arbitrum-nova': {
    chainId: 42170,
    name: 'Arbitrum Nova',
    alchemyNetwork: 'arbnova-mainnet',
    reason: 'No contractValidator deployed',
    rpcUrls: envArray('ARBITRUM_NOVA_RPC_URL', [
      getAlchemyUrl('arbitrum-nova'),
      'https://arbitrum-nova-rpc.publicnode.com',
      'https://arbitrum-nova.drpc.org',
      'https://arbitrum-nova.public.blastapi.io',
      'https://nova.arbitrum.io/rpc'
    ].filter(Boolean)),
    nativeCurrency: 'ETH'
  },

  celo: {
    chainId: 42220,
    name: 'Celo',
    alchemyNetwork: 'celo-mainnet',
    reason: 'No contractValidator deployed',
    rpcUrls: envArray('CELO_RPC_URL', [
      getAlchemyUrl('celo'),
      'https://forno.celo.org',
      'https://celo.drpc.org',
      'https://celo-json-rpc.stakely.io',
      'https://celo.api.onfinality.io/public'
    ].filter(Boolean)),
    nativeCurrency: 'CELO'
  },

  moonbeam: {
    chainId: 1284,
    name: 'Moonbeam',
    alchemyNetwork: 'moonbeam-mainnet',
    reason: 'No contractValidator deployed',
    rpcUrls: envArray('MOONBEAM_RPC_URL', [
      getAlchemyUrl('moonbeam'),
      'https://rpc.api.moonbeam.network',
      'https://moonbeam.api.onfinality.io/public',
      'https://moonbeam.unitedbloc.com',
      'https://1rpc.io/glmr',
      'https://moonbeam-rpc.dwellir.com',
      'https://moonbeam.drpc.org',
      'https://moonbeam.therpc.io'
    ].filter(Boolean)),
    nativeCurrency: 'GLMR'
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

module.exports = { NETWORKS, CONFIG };