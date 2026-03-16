/**
 * EOAFilter - Address classification (EOA vs Contract)
 * Extracted from UnifiedScanner for reuse.
 * All functions take a Scanner instance as first argument.
 */

/**
 * Classify addresses into EOAs, contracts, and self-destructed contracts
 * @param {Scanner} scanner - Scanner instance
 * @param {string[]} addresses - Array of addresses to classify
 * @returns {{ eoas: Array, contracts: Array, selfDestructed: Array }}
 */
async function filterAddresses(scanner, addresses) {
  scanner.log(`Processing ${addresses.length} addresses for advanced EOA filtering...`);

  // Check which are contracts vs EOA
  const contractFlags = await scanner.isContracts(addresses);
  const codeHashes = await scanner.getCodeHashes(addresses);

  // Batch fetch deployment times from database for all potential contracts
  const deploymentCache = new Map();

  try {
    const deploymentQuery = `
      SELECT address, deployed, code_hash, contract_name, name_checked
      FROM addresses
      WHERE address = ANY($1)
      AND network = $2
    `;
    const deploymentResult = await scanner.queryDB(deploymentQuery, [addresses, scanner.network]);

    for (const row of deploymentResult.rows) {
      deploymentCache.set(row.address.toLowerCase(), {
        deployed: row.deployed,
        codeHash: row.code_hash,
        contractName: row.contract_name,
        nameChecked: row.name_checked
      });
    }

    scanner.log(`📊 Loaded ${deploymentCache.size} deployment times from cache`);
  } catch (error) {
    scanner.log(`⚠️ Failed to batch fetch deployment times: ${error.message}`, 'warn');
  }

  const eoas = [];
  const contracts = [];
  const selfDestructed = [];

  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i];
    const isContract = contractFlags[i];
    const codeHash = codeHashes[i] || null;
    const ZERO_HASH = scanner.ZERO_HASH;

    if (isContract && codeHash && codeHash !== ZERO_HASH) {
      let deployTime = null;
      let isGenesisContract = false;
      let needsDeploymentTime = false;

      const cached = deploymentCache.get(address.toLowerCase());
      if (cached && cached.deployed && cached.deployed > 0) {
        deployTime = cached.deployed;
        scanner.log(`📋 Using cached deployment time for ${address}`);
      } else {
        needsDeploymentTime = true;
        deployTime = null;

        const { getGenesisTimestamp } = require('../config/genesis-timestamps');
        const genesisTime = getGenesisTimestamp(scanner.config?.chainId);
        if (genesisTime) {
          isGenesisContract = false;
        }
      }

      const { safeGetAddressType } = require('../common');
      const addressType = safeGetAddressType(address, codeHash, deployTime);

      if (!addressType || addressType === 'unknown') {
        scanner.log(`⚠️ Unknown address type for ${address} - skipping`, 'warn');
        continue;
      }

      if (addressType === 'eoa') {
        eoas.push({ address, codeHash: null, isContract: false });
      } else if (addressType === 'eip7702_eoa') {
        if (!codeHash || codeHash === ZERO_HASH) {
          scanner.log(`⚠️ Skipping EIP-7702 EOA ${address} - invalid code hash (${codeHash})`, 'warn');
          continue;
        }

        scanner.log(`🎯 EIP-7702 EOA detected: ${address}`, 'info');
        eoas.push({
          address,
          codeHash: codeHash,
          isContract: false,
          type: 'eip7702_eoa',
          tags: ['EOA', 'SmartWallet']
        });
      } else if (addressType === 'smart_contract' || addressType === 'contract') {
        if (deployTime) {
          scanner.log(`📍 Contract ${address} deployment time: ${new Date(deployTime * 1000).toISOString()}`);
        } else if (needsDeploymentTime) {
          scanner.log(`📍 Contract ${address} - deployment time will be fetched asynchronously`);
        }

        contracts.push({
          address,
          codeHash,
          deployTime,
          type: 'smart_contract',
          isGenesis: isGenesisContract,
          needsDeploymentTime: needsDeploymentTime || false,
          nameChecked: cached?.nameChecked || false,
          contractName: cached?.contractName || null
        });
      } else {
        scanner.log(`⚠️ Unknown address type for ${address} - skipping (uncertain data)`, 'warn');
        continue;
      }
    } else if (!isContract) {
      const cached = deploymentCache.get(address.toLowerCase());

      if (cached && cached.codeHash && cached.codeHash !== ZERO_HASH) {
        scanner.log(`💥 Self-destructed contract detected: ${address}`);
        selfDestructed.push({
          address,
          codeHash: cached.codeHash,
          type: 'self_destroyed',
          contractName: 'Self-Destroyed Contract',
          tags: ['Contract', 'SelfDestroyed']
        });
      } else {
        eoas.push({ address, codeHash: null, isContract: false });
      }
    } else {
      scanner.log(`⚠️ Unexpected state for ${address}: isContract=${isContract}, codeHash=${codeHash}`, 'warn');
      eoas.push({ address, codeHash: null, isContract: false });
    }
  }

  scanner.log(`Simplified filtering: ${eoas.length} EOAs (including EIP-7702), ${contracts.length} smart contracts, ${selfDestructed.length} self-destroyed`);

  return { eoas, contracts, selfDestructed };
}

/**
 * Asynchronously fetch deployment times for contracts that need them
 * @param {Scanner} scanner - Scanner instance
 * @param {Array} contracts - Array of contract objects with needsDeploymentTime flag
 */
async function fetchDeploymentTimes(scanner, contracts = []) {
  const contractsNeedingTime = contracts.filter(c => c.needsDeploymentTime);

  if (contractsNeedingTime.length === 0) return;

  scanner.log(`⏳ Starting async deployment time fetch for ${contractsNeedingTime.length} contracts...`);

  const batchSize = 5;
  const { getContractDeploymentTimeBatch } = require('../common');

  for (let i = 0; i < contractsNeedingTime.length; i += batchSize) {
    const batch = contractsNeedingTime.slice(i, i + batchSize);
    const batchAddresses = batch.map(c => c.address);

    try {
      const deploymentResults = await getContractDeploymentTimeBatch(scanner, batchAddresses);

      for (const contract of batch) {
        const result = deploymentResults.get(contract.address.toLowerCase());

        if (result && result.timestamp && result.timestamp > 0) {
          contract.deployTime = result.timestamp;
          contract.isGenesis = result.isGenesis;
          scanner.log(`✅ Fetched deployment time for ${contract.address}: ${new Date(result.timestamp * 1000).toISOString()}`);
        } else {
          scanner.log(`⚠️ No deployment time found for ${contract.address}`, 'warn');
        }
      }
    } catch (error) {
      scanner.log(`⚠️ Batch deployment fetch failed for ${batchAddresses.join(', ')}: ${error.message}`, 'warn');
    }

    const useEtherscanProxy = process.env.USE_ETHERSCAN_PROXY === 'true';
    if (!useEtherscanProxy && i + batchSize < contractsNeedingTime.length) {
      await scanner.sleep(1000);
    }
  }

  scanner.log(`✅ Completed async deployment time fetch for ${contractsNeedingTime.length} contracts`);
}

module.exports = {
  filterAddresses,
  fetchDeploymentTimes
};
