/**
 * Common Utilities Index
 * Central export point for all common utilities
 */

// Import from the 3 consolidated files
const core = require('./core');
const database = require('./database');
const Scanner = require('./Scanner');

// Re-export everything for backward compatibility
module.exports = {
  // Core Scanner class
  Scanner,
  
  // From core.js (includes all former helpers.js functions)
  ...core,
  
  // From database.js
  ...database,
  
  // Backward compatibility aliases
  utils: core,
  contractCall: core.contractCall,
  httpRpc: { HttpRpcClient: core.HttpRpcClient, createRpcClient: core.createRpcClient },
  db: database,
  apiLimiter: { APILimiter: core.APILimiter, globalAPILimiter: core.globalAPILimiter },
  constants: core,  // Now all constants are in core.js
  helpers: core     // All helpers merged into core.js
};