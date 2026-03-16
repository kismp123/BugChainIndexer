/**
 * ContractVerifier - Contract source code verification via Etherscan
 * Extracted from UnifiedScanner for reuse.
 * All functions take a Scanner instance as first argument.
 */

/**
 * Verify contracts via Etherscan API
 * @param {Scanner} scanner - Scanner instance (must have etherscanCall, log, network, currentTime)
 * @param {Array} contracts - Array of contract objects
 * @returns {Array} Verified contract data
 */
async function verify(scanner, contracts = []) {
  if (contracts.length === 0) return [];

  const needsVerification = contracts.filter(c => !c.nameChecked);
  const alreadyVerified = contracts.filter(c => c.nameChecked);

  scanner.log(`🔍 Contracts: ${contracts.length} total, ${alreadyVerified.length} cached, ${needsVerification.length} need verification`);

  const verifiedContracts = alreadyVerified.map(c => ({
    address: c.address,
    network: scanner.network,
    verified: true,
    contractName: c.contractName || 'Unknown',
    codeHash: c.codeHash,
    deployTime: c.deployTime || null,
    needsDeploymentTime: !c.deployTime || c.deployTime <= 0,
    sourceCode: null,
    abi: null,
    compilerVersion: null,
    optimization: false,
    runs: 0,
    constructorArguments: null,
    evmVersion: null,
    library: null,
    licenseType: null,
    proxy: false,
    implementation: null,
    swarmSource: null,
    nameChecked: true,
    nameCheckedAt: scanner.currentTime || Math.floor(Date.now() / 1000),
    lastUpdated: scanner.currentTime || Math.floor(Date.now() / 1000)
  }));

  if (alreadyVerified.length > 0) {
    scanner.log(`✅ Using ${alreadyVerified.length} cached verified contracts`);
  }

  if (needsVerification.length === 0) {
    scanner.log(`📊 All contracts already verified (from cache)`);
    return verifiedContracts;
  }

  scanner.log(`🔍 Verifying ${needsVerification.length} new contracts with batch processing...`);

  const batchSize = 5;
  const { getContractNameWithProxy } = require('../common');

  for (let i = 0; i < needsVerification.length; i += batchSize) {
    const batch = needsVerification.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(needsVerification.length / batchSize);

    scanner.log(`📦 Processing verification batch ${batchNum}/${totalBatches} (${batch.length} contracts)`);

    const batchPromises = batch.map(async (contract) => {
      const contractAddr = contract.address || contract;

      try {
        const result = await scanner.etherscanCall({
          module: 'contract',
          action: 'getsourcecode',
          address: contractAddr
        });

        if (!result || !Array.isArray(result) || result.length === 0) {
          return {
            address: contractAddr,
            network: scanner.network,
            verified: false,
            error: 'Invalid API response'
          };
        }

        const sourceData = result[0];
        if (!sourceData.SourceCode || sourceData.SourceCode === '') {
          return {
            address: contractAddr,
            network: scanner.network,
            verified: false,
            error: 'Source code not verified'
          };
        }

        const finalContractName = await getContractNameWithProxy(scanner, contractAddr, sourceData);

        return {
          address: contractAddr,
          network: scanner.network,
          verified: true,
          contractName: finalContractName || sourceData.ContractName || 'Unknown',
          codeHash: contract.codeHash || null,
          deployTime: null,
          needsDeploymentTime: true,
          sourceCode: sourceData.SourceCode,
          abi: sourceData.ABI ? JSON.parse(sourceData.ABI) : null,
          compilerVersion: sourceData.CompilerVersion || null,
          optimization: sourceData.OptimizationUsed === '1',
          runs: parseInt(sourceData.Runs) || 0,
          constructorArguments: sourceData.ConstructorArguments || null,
          evmVersion: sourceData.EVMVersion || 'default',
          library: sourceData.Library || null,
          licenseType: sourceData.LicenseType || null,
          proxy: sourceData.Proxy === '1',
          implementation: sourceData.Implementation || null,
          swarmSource: sourceData.SwarmSource || null,
          nameChecked: true,
          nameCheckedAt: scanner.currentTime || Math.floor(Date.now() / 1000),
          lastUpdated: scanner.currentTime || Math.floor(Date.now() / 1000)
        };
      } catch (error) {
        return {
          address: contractAddr,
          network: scanner.network,
          verified: false,
          error: error.message
        };
      }
    });

    const batchResults = await Promise.allSettled(batchPromises);

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        const contractData = result.value;

        if (contractData.verified) {
          verifiedContracts.push(contractData);
          scanner.log(`✅ Verified: ${contractData.address} (${contractData.contractName})`);
        } else {
          const unverifiedContract = {
            address: contractData.address,
            network: scanner.network,
            verified: false,
            contractName: null,
            codeHash: null,
            deployTime: null,
            needsDeploymentTime: false,
            sourceCode: null,
            abi: null,
            compilerVersion: null,
            optimization: false,
            runs: 0,
            constructorArguments: null,
            evmVersion: null,
            library: null,
            licenseType: null,
            proxy: false,
            implementation: null,
            swarmSource: null,
            nameChecked: false,
            nameCheckedAt: 0,
            lastUpdated: scanner.currentTime || Math.floor(Date.now() / 1000)
          };

          verifiedContracts.push(unverifiedContract);

          if (contractData.error && !contractData.error.includes('Source code not verified')) {
            scanner.log(`⚠️ ${contractData.address}: ${contractData.error}`, 'warn');
          }
        }
      } else {
        const contractAddr = batch[batchResults.indexOf(result)].address || batch[batchResults.indexOf(result)];
        verifiedContracts.push({
          address: contractAddr,
          network: scanner.network,
          verified: false,
          contractName: null,
          codeHash: null,
          deployTime: null,
          needsDeploymentTime: false,
          sourceCode: null,
          abi: null,
          compilerVersion: null,
          optimization: false,
          runs: 0,
          constructorArguments: null,
          evmVersion: null,
          library: null,
          licenseType: null,
          proxy: false,
          implementation: null,
          swarmSource: null,
          nameChecked: false,
          nameCheckedAt: 0,
          lastUpdated: scanner.currentTime || Math.floor(Date.now() / 1000)
        });

        scanner.log(`❌ Verification failed for contract: ${result.reason}`, 'error');
      }
    }

    const useEtherscanProxy = process.env.USE_ETHERSCAN_PROXY === 'true';
    if (!useEtherscanProxy && i + batchSize < needsVerification.length) {
      await scanner.sleep(1000);
    }
  }

  const verified = verifiedContracts.filter(c => c.verified).length;
  scanner.log(`📊 Verification complete: ${verified}/${contracts.length} verified (${alreadyVerified.length} from cache, ${needsVerification.length} newly verified)`);

  return verifiedContracts;
}

module.exports = {
  verify
};
