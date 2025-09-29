/**
 * Address validation and normalization utilities
 */

/**
 * Normalize Ethereum address to standard format
 * @param {string} address - The address to normalize
 * @returns {string|null} - Normalized address or null if invalid
 */
function normalizeAddress(address) {
  if (!address) return null;
  
  // Convert to string and trim whitespace
  address = String(address).trim();
  
  // Handle empty or invalid input
  if (!address || address === 'undefined' || address === 'null') {
    return null;
  }
  
  // Remove any quotes that might wrap the address
  address = address.replace(/['"]/g, '');
  
  // Handle missing 0x prefix
  if (!/^0x/i.test(address)) {
    // If it's 40 hex chars without 0x, add the prefix
    if (/^[a-fA-F0-9]{40}$/i.test(address)) {
      address = '0x' + address;
    } else {
      return null; // Invalid format
    }
  }
  
  // Extract just the hex part after 0x
  const hexPart = address.slice(2);
  
  // Remove any non-hex characters
  const cleanHex = hexPart.replace(/[^a-fA-F0-9]/g, '');
  
  // Must be exactly 40 hex characters
  if (cleanHex.length !== 40) {
    // Try padding with zeros if it's shorter
    if (cleanHex.length < 40 && cleanHex.length > 0) {
      const padded = cleanHex.padStart(40, '0');
      return '0x' + padded.toLowerCase();
    }
    return null; // Invalid length
  }
  
  // Return normalized address in lowercase
  return ('0x' + cleanHex).toLowerCase();
}

/**
 * Check if an address is valid
 * @param {string} address - The address to validate
 * @returns {boolean} - True if valid
 */
function isValidAddress(address) {
  if (!address) return false;
  const normalized = normalizeAddress(address);
  return normalized !== null && /^0x[a-f0-9]{40}$/i.test(normalized);
}

/**
 * Clean parameters that might contain addresses
 * @param {object} params - Parameters object
 * @returns {object} - Cleaned parameters
 */
function cleanAddressParams(params) {
  if (!params) return params;
  
  const cleaned = { ...params };
  
  // List of common parameter names that contain addresses
  const addressFields = [
    'address',
    'contractaddress',
    'contractAddress', 
    'from',
    'to',
    'walletaddress',
    'walletAddress',
    'useraddress',
    'userAddress',
    'tokenaddress',
    'tokenAddress',
    'account'
  ];
  
  // Clean individual address fields
  for (const field of addressFields) {
    if (cleaned[field]) {
      const normalized = normalizeAddress(cleaned[field]);
      if (normalized) {
        cleaned[field] = normalized;
      } else {
        // Log warning but keep original value for debugging
        console.warn(`[AddressUtils] Invalid address in field '${field}': ${cleaned[field]}`);
        // For Etherscan, it's better to send the original and let it fail
        // than to remove the field entirely
      }
    }
  }
  
  // Handle address arrays
  if (cleaned.addresses && Array.isArray(cleaned.addresses)) {
    cleaned.addresses = cleaned.addresses
      .map(addr => normalizeAddress(addr))
      .filter(addr => addr !== null);
  }
  
  // Handle special case for Etherscan's address parameter format
  // Some endpoints accept comma-separated addresses
  if (cleaned.address && typeof cleaned.address === 'string' && cleaned.address.includes(',')) {
    const addresses = cleaned.address.split(',');
    const normalizedAddresses = addresses
      .map(addr => normalizeAddress(addr.trim()))
      .filter(addr => addr !== null);
    cleaned.address = normalizedAddresses.join(',');
  }
  
  return cleaned;
}

module.exports = {
  normalizeAddress,
  isValidAddress,
  cleanAddressParams
};