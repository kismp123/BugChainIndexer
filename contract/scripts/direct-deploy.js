#!/usr/bin/env node
/**
 * Direct RPC Contract Deployment Script
 * Bypasses Gelato and deploys directly to supported networks
 */

require('dotenv').config();
const { ethers } = require("ethers");
const fs = require('fs');
const path = require('path');

// Import network configuration
const NETWORKS = require('../../scanners/config/networks.js');

class DirectDeployer {
  constructor() {
    this.contractBytecodes = {};
    this.deploymentResults = [];
    this.targetDeployments = [];
    
    // Private key (loaded from environment variables)
    this.privateKey = process.env.PRIVATE_KEY;
    if (!this.privateKey) {
      throw new Error('PRIVATE_KEY environment variable is required');
    }
    
    console.log(`🔑 Using wallet: ${new ethers.Wallet(this.privateKey).address}`);
  }

  async analyzeDeploymentNeeds() {
    console.log("🔍 Analyzing deployment needs for all networks...");
    
    const deploymentNeeds = [];
    let totalNetworks = 0;
    let alreadyDeployed = 0;
    let needsDeployment = 0;

    for (const [networkName, config] of Object.entries(NETWORKS)) {
      // Skip config properties
      if (['database', 'coinGeckoAPI', 'etherscanApiKeys', 'TIMEDELAY', 'FUNDUPDATEDELAY', 
           'TIMEOUT_SECONDS', 'TIMEOUT_KILL_AFTER', 'runFixDeployed', 'runVerifyContracts'].includes(networkName)) {
        continue;
      }

      totalNetworks++;

      const networkNeeds = {
        networkName,
        chainId: config.chainId,
        name: config.name,
        rpcUrls: config.rpcUrls,
        contracts: []
      };

      if (!config.BalanceHelper || config.BalanceHelper === null) {
        networkNeeds.contracts.push('BalanceHelper');
      } else {
        console.log(`✅ ${networkName} already has BalanceHelper: ${config.BalanceHelper}`);
      }

      if (!config.contractValidator || config.contractValidator === null) {
        networkNeeds.contracts.push('contractValidator');
      } else {
        console.log(`✅ ${networkName} already has contractValidator: ${config.contractValidator}`);
      }

      if (networkNeeds.contracts.length > 0) {
        deploymentNeeds.push(networkNeeds);
        needsDeployment++;
        console.log(`🚀 ${networkName} needs: ${networkNeeds.contracts.join(', ')}`);
      } else {
        alreadyDeployed++;
        console.log(`✨ ${networkName} has all contracts deployed`);
      }
    }

    this.targetDeployments = deploymentNeeds;

    console.log(`\n📊 Direct Deployment Analysis:`);
    console.log(`   Total networks in config: ${totalNetworks}`);
    console.log(`   Already fully deployed: ${alreadyDeployed}`);
    console.log(`   🎯 Networks needing deployment: ${needsDeployment}`);
    console.log(`   Total deployments needed: ${deploymentNeeds.reduce((sum, n) => sum + n.contracts.length, 0)}`);

    return deploymentNeeds.length > 0;
  }

  async loadContractBytecodes() {
    console.log("\n📚 Loading contract bytecodes...");
    
    const neededContracts = new Set();
    this.targetDeployments.forEach(network => {
      network.contracts.forEach(contract => neededContracts.add(contract));
    });

    console.log(`🔨 Compiling contracts: ${Array.from(neededContracts).join(', ')}`);
    
    try {
      this.contractBytecodes = {};
      
      for (const contractName of neededContracts) {
        const bytecode = await this.compileContract(contractName);
        this.contractBytecodes[contractName] = bytecode;
      }
      
      console.log("✅ Contract bytecodes loaded successfully");
      
    } catch (error) {
      console.error("❌ Failed to load contract bytecodes:", error.message);
      throw error;
    }
  }

  async compileContract(contractName) {
    console.log(`🔨 Compiling ${contractName}...`);
    
    const { execSync } = require('child_process');
    const contractDir = path.join(__dirname, '..');
    
    try {
      execSync(
        `cd ${contractDir} && forge build --extra-output-files bin --root .`,
        { encoding: 'utf8', stdio: 'pipe' }
      );
      
      const artifactPath = path.join(contractDir, 'out', `${contractName}.sol`, `${contractName}.json`);
      
      if (!fs.existsSync(artifactPath)) {
        throw new Error(`Compiled artifact not found: ${artifactPath}`);
      }
      
      const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
      const bytecode = artifact.bytecode.object;
      
      if (!bytecode || bytecode === '0x') {
        throw new Error(`Invalid bytecode for ${contractName}`);
      }
      
      console.log(`✅ ${contractName} compiled successfully (${bytecode.length} bytes)`);
      return bytecode;
      
    } catch (error) {
      console.error(`❌ Failed to compile ${contractName}:`, error.message);
      throw error;
    }
  }

  async deployWithDirectRPC() {
    console.log("\n🚀 Starting direct RPC deployment...");
    
    for (const networkNeed of this.targetDeployments) {
      for (const contractName of networkNeed.contracts) {
        try {
          console.log(`\n🌐 Processing ${networkNeed.name} (${networkNeed.networkName})...`);
          
          const result = await this.deployContract(
            contractName,
            networkNeed.networkName,
            networkNeed
          );
          
          this.deploymentResults.push(result);
          
          if (result.status === 'success') {
            console.log(`  🎉 ${contractName} deployed successfully!`);
            console.log(`     Address: ${result.contractAddress}`);
            console.log(`     TX: ${result.transactionHash}`);
            console.log(`     Gas Used: ${result.gasUsed}`);
          } else {
            console.error(`  ❌ ${contractName} deployment failed: ${result.error}`);
          }
          
          // Wait to prevent network overload
          await this.sleep(2000);
          
        } catch (error) {
          console.error(`❌ Deployment failed:`, error.message);
          this.deploymentResults.push({
            contractName: contractName,
            networkName: networkNeed.networkName,
            chainId: networkNeed.chainId,
            error: error.message,
            status: 'failed',
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    return this.deploymentResults;
  }

  async deployContract(contractName, networkName, config, retryCount = 0) {
    const maxRetries = 3;
    
    try {
      const bytecode = this.contractBytecodes[contractName];
      
      if (!bytecode) {
        throw new Error(`Bytecode not found for ${contractName}`);
      }
      
      if (retryCount > 0) {
        console.log(`  🔄 Retry attempt ${retryCount}/${maxRetries} for ${contractName} on ${networkName}...`);
      } else {
        console.log(`  📤 Deploying ${contractName} to ${networkName} (Chain ID: ${config.chainId})...`);
      }
      
      // RPC Provider setup
      const provider = await this.getProvider(config);
      const wallet = new ethers.Wallet(this.privateKey, provider);
      
      console.log(`  💼 Wallet address: ${wallet.address}`);
      
      // Check balance
      const balance = await wallet.getBalance();
      console.log(`  💰 Wallet balance: ${ethers.utils.formatEther(balance)} ${config.nativeCurrency || 'ETH'}`);
      
      if (balance.eq(0)) {
        throw new Error(`Insufficient balance on ${networkName}. Need native tokens for gas.`);
      }
      
      // Get current network gas prices
      console.log(`  📊 Fetching current gas prices...`);
      const feeData = await provider.getFeeData();
      
      // Attempt actual gas estimation
      let estimatedGas;
      try {
        estimatedGas = await provider.estimateGas({
          data: bytecode,
          from: wallet.address
        });
        console.log(`  📏 Estimated gas: ${estimatedGas.toString()}`);
      } catch (error) {
        console.log(`  ⚠️ Gas estimation failed: ${error.message}`);
        // For Linea, use more conservative gas
        if (config.chainId === 59144) {
          estimatedGas = ethers.BigNumber.from(1200000); // Linea set low
        } else {
          estimatedGas = ethers.BigNumber.from(this.getGasLimit(contractName, config.chainId));
        }
        console.log(`  📏 Using fallback gas limit: ${estimatedGas.toString()}`);
      }
      
      // Add 20% buffer
      const gasLimit = estimatedGas.mul(120).div(100);
      console.log(`  🔧 Gas limit with buffer: ${gasLimit.toString()}`);
      
      // Create transaction
      const tx = {
        data: bytecode,
        gasLimit: gasLimit,
      };
      
      // Adjust appropriately based on current gas prices
      if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
        // EIP-1559: Set more realistically considering current baseFee + priority
        const baseFee = feeData.maxFeePerGas.sub(feeData.maxPriorityFeePerGas);
        
        // Set priority fee to 50% of current level (more economical)
        const adjustedPriorityFee = feeData.maxPriorityFeePerGas.div(2);
        
        // MaxFee is baseFee + adjustedPriorityFee + 20% buffer
        const adjustedMaxFee = baseFee.add(adjustedPriorityFee).mul(120).div(100);
        
        tx.maxFeePerGas = adjustedMaxFee;
        tx.maxPriorityFeePerGas = adjustedPriorityFee;
        
        console.log(`  ⛽ Using adjusted EIP-1559:`);
        console.log(`     base: ${ethers.utils.formatUnits(baseFee, 'gwei')} gwei`);
        console.log(`     priority: ${ethers.utils.formatUnits(adjustedPriorityFee, 'gwei')} gwei`);
        console.log(`     maxFee: ${ethers.utils.formatUnits(adjustedMaxFee, 'gwei')} gwei`);
        
      } else if (feeData.gasPrice) {
        // Legacy: Set to 110% of current gas price
        const adjustedGasPrice = feeData.gasPrice.mul(110).div(100);
        tx.gasPrice = adjustedGasPrice;
        console.log(`  ⛽ Using adjusted legacy: ${ethers.utils.formatUnits(adjustedGasPrice, 'gwei')} gwei`);
      } else {
        // Fallback: 1 gwei
        tx.gasPrice = ethers.utils.parseUnits('1', 'gwei');
        console.log(`  ⛽ Using fallback gas price: 1 gwei`);
      }
      
      // Calculate estimated cost
      const estimatedCost = gasLimit.mul(tx.maxFeePerGas || tx.gasPrice || ethers.utils.parseUnits('1', 'gwei'));
      const currency = config.nativeCurrency || 'ETH';
      console.log(`  💳 Estimated cost: ${ethers.utils.formatEther(estimatedCost)} ${currency}`);
      
      // Check if balance is sufficient
      if (balance.lt(estimatedCost)) {
        throw new Error(`Insufficient balance: need ${ethers.utils.formatEther(estimatedCost)} ${currency}, have ${ethers.utils.formatEther(balance)} ${currency}`);
      }
      
      console.log(`  📤 Sending transaction...`);
      const txResponse = await wallet.sendTransaction(tx);
      
      console.log(`  📧 Transaction sent: ${txResponse.hash}`);
      console.log(`  ⏳ Waiting for confirmation...`);
      
      let receipt;
      try {
        receipt = await this.waitForTransactionReceipt(provider, txResponse.hash, 120000); // 2 minute timeout
      } catch (error) {
        console.log(`  ⚠️ Receipt timeout, trying alternative RPC for confirmation...`);
        receipt = await this.checkTransactionWithFallback(config, txResponse.hash);
      }
      
      const deploymentInfo = {
        contractName,
        networkName,
        chainId: config.chainId,
        contractAddress: receipt.contractAddress,
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        status: 'success',
        timestamp: new Date().toISOString(),
        method: 'directRPC'
      };
      
      // Update config immediately upon successful deployment
      console.log(`  📝 Updating network config for ${networkName}...`);
      await this.updateNetworkConfig(networkName, contractName, receipt.contractAddress);
      
      return deploymentInfo;
      
    } catch (error) {
      // Handle insufficient balance error  
      if (error.message.includes('insufficient funds') || error.message.includes('Insufficient balance')) {
        console.error(`  💸 Balance insufficient for deployment on ${networkName}!`);
        console.error(`  📝 Error: ${error.message}`);
        throw error; // immediate failure handling
      }
      
      // Retry on gas-related or network errors
      if ((error.message.includes('gas') || 
           error.message.includes('network') ||
           error.message.includes('timeout')) && retryCount < maxRetries) {
        const retryDelay = (retryCount + 1) * 5000;
        console.log(`  ⏳ Error occurred. Waiting ${retryDelay/1000}s before retry ${retryCount + 1}/${maxRetries}...`);
        console.log(`  📝 Error: ${error.message}`);
        
        await this.sleep(retryDelay);
        return await this.deployContract(contractName, networkName, config, retryCount + 1);
      }
      
      console.error(`  ❌ Failed to deploy ${contractName} to ${networkName}:`, error.message);
      throw error;
    }
  }

  async getProvider(config) {
    // RPC URL priority: Rearranged in order of high stability
    let rpcUrls = [...config.rpcUrls];
    
    // For Gnosis, prioritize more stable RPCs
    if (config.chainId === 100) {
      rpcUrls = [
        'https://gnosis.publicnode.com',
        'https://endpoints.omniatech.io/v1/gnosis/mainnet/public',
        'https://gnosis-rpc.publicnode.com',
        'https://1rpc.io/gnosis',
        'https://gnosis.blockpi.network/v1/rpc/public',
        ...config.rpcUrls.filter(url => !url.includes('drpc.org')) // exclude drpc
      ];
    }
    
    // Try first RPC URL, move to next if failed
    for (const rpcUrl of rpcUrls) {
      try {
        const provider = new ethers.providers.JsonRpcProvider({
          url: rpcUrl,
          timeout: 30000 // 30 second timeout
        });
        // Network connection test
        await provider.getNetwork();
        console.log(`  🌐 Connected to RPC: ${rpcUrl.substring(0, 50)}...`);
        return provider;
      } catch (error) {
        console.log(`  ⚠️ RPC failed: ${rpcUrl.substring(0, 50)}... - ${error.message}`);
        continue;
      }
    }
    
    throw new Error(`All RPC URLs failed for ${config.name}`);
  }

  getGasLimit(contractName, chainId) {
    // Default gas limits by network (more conservative considering balance)
    const networkGasMultipliers = {
      43114: 1.8,  // Avalanche - high gas
      100: 1.6,    // Gnosis - high gas  
      59144: 1.8,  // Linea - high gas
      534352: 1.2, // Scroll - lowered due to insufficient balance
      1101: 1.4,   // Polygon zkEVM - normal gas
      42161: 1.3,  // Arbitrum - normal gas
      10: 1.2,     // Optimism - slightly high gas
      8453: 1.2,   // Base - slightly high gas
      5000: 1.3,   // Mantle
      204: 1.2,    // opBNB
    };
    
    const baseGasLimits = {
      'BalanceHelper': 1300000,      // slightly lowered
      'contractValidator': 1000000   // slightly lowered
    };
    
    const baseGas = baseGasLimits[contractName] || 1500000;
    const multiplier = networkGasMultipliers[chainId] || 1.3; // default value also lowered
    
    return Math.floor(baseGas * multiplier);
  }

  async generateNetworkConfigUpdate() {
    console.log("\n📝 Generating network configuration updates...");
    
    const updates = {};
    const successfulDeployments = this.deploymentResults.filter(d => d.status === 'success' && d.contractAddress);
    
    if (successfulDeployments.length === 0) {
      console.log("🔍 No successful deployments to update configuration with");
      return {};
    }
    
    for (const deployment of successfulDeployments) {
      if (!updates[deployment.networkName]) {
        updates[deployment.networkName] = {};
      }
      
      updates[deployment.networkName][deployment.contractName] = deployment.contractAddress;
    }
    
    console.log("🔄 Network configuration updates:");
    console.log(JSON.stringify(updates, null, 2));
    
    if (process.env.AUTO_UPDATE_CONFIG === 'true') {
      await this.updateNetworksConfig(updates);
    } else {
      console.log("\n💡 To automatically update networks.js, set AUTO_UPDATE_CONFIG=true");
      console.log("   Or manually update the configuration using the addresses above.");
    }
    
    return updates;
  }

  async updateNetworksConfig(updates) {
    try {
      const configPath = path.join(__dirname, '../../scanners/config/networks.js');
      let configContent = fs.readFileSync(configPath, 'utf8');
      
      for (const [networkName, contracts] of Object.entries(updates)) {
        for (const [contractName, address] of Object.entries(contracts)) {
          const regex = new RegExp(
            `(${networkName}:[\\s\\S]*?${contractName}:\\s*)null([\\s\\S]*?)`,
            'g'
          );
          
          configContent = configContent.replace(regex, `$1'${address}'$2`);
          
          const commentRegex = new RegExp(
            `(${networkName}:[\\s\\S]*?${contractName}:\\s*)null(\\s*//[^\\n]*)?([\\s\\S]*?)`,
            'g'
          );
          
          configContent = configContent.replace(commentRegex, `$1'${address}'$3`);
        }
      }
      
      fs.writeFileSync(configPath, configContent);
      console.log("✅ networks.js updated successfully");
      
    } catch (error) {
      console.error("❌ Failed to update networks.js:", error.message);
    }
  }

  generateReport() {
    console.log("\n📊 Direct RPC Deployment Report");
    console.log("=".repeat(60));
    
    const summary = {
      total: this.deploymentResults.length,
      success: this.deploymentResults.filter(d => d.status === 'success').length,
      failed: this.deploymentResults.filter(d => d.status === 'failed').length,
      networksProcessed: this.targetDeployments.length
    };
    
    console.log(`📈 Summary:`);
    console.log(`   Networks processed: ${summary.networksProcessed}`);
    console.log(`   Total deployments: ${summary.total}`);
    console.log(`   ✅ Successful: ${summary.success}`);
    console.log(`   ❌ Failed: ${summary.failed}`);
    
    if (summary.total > 0) {
      const successRate = (summary.success / summary.total) * 100;
      console.log(`   🎯 Success Rate: ${successRate.toFixed(1)}%`);
    }
    
    // Gas usage statistics
    const successfulDeployments = this.deploymentResults.filter(d => d.status === 'success');
    if (successfulDeployments.length > 0) {
      const totalGasUsed = successfulDeployments.reduce((sum, d) => sum + parseInt(d.gasUsed), 0);
      const avgGasUsed = Math.floor(totalGasUsed / successfulDeployments.length);
      console.log(`   ⛽ Average Gas Used: ${avgGasUsed.toLocaleString()}`);
    }
    
    // Detailed results
    if (this.deploymentResults.length > 0) {
      console.log(`\n📋 Detailed Results:`);
      this.deploymentResults.forEach(deployment => {
        const statusIcon = deployment.status === 'success' ? '✅' : '❌';
        
        console.log(`${statusIcon} ${deployment.contractName} on ${deployment.networkName} (${deployment.chainId})`);
        if (deployment.contractAddress) {
          console.log(`     Address: ${deployment.contractAddress}`);
          console.log(`     TX: ${deployment.transactionHash}`);
          if (deployment.gasUsed) {
            console.log(`     Gas Used: ${parseInt(deployment.gasUsed).toLocaleString()}`);
          }
        }
        if (deployment.error) {
          console.log(`     Error: ${deployment.error}`);
        }
      });
    }
    
    const reportPath = path.join(__dirname, '../direct-deployment-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      summary,
      deployments: this.deploymentResults
    }, null, 2));
    
    console.log(`\n💾 Detailed report saved to: ${reportPath}`);
    
    return summary;
  }

  async updateNetworkConfig(networkName, contractName, contractAddress) {
    try {
      const configPath = path.resolve(__dirname, '../../scanners/config/networks.js');
      let configContent = fs.readFileSync(configPath, 'utf8');
      
      // Property name mapping (might be BalanceHelper in script, balanceHelper in config)
      const propertyMapping = {
        'BalanceHelper': ['BalanceHelper', 'balanceHelper'],
        'contractValidator': ['contractValidator']
      };
      
      const possibleProps = propertyMapping[contractName] || [contractName];
      let updated = false;
      
      // 1. Direct update in ADDITIONAL_NETWORKS definition
      for (const propName of possibleProps) {
        // Find the network in ADDITIONAL_NETWORKS
        const additionalNetworkPattern = new RegExp(
          `(${networkName}:\\s*{[^}]*${propName}:\\s*)('[^']*'|null)([^,}\\n]*)`,
          'gs'
        );
        
        if (configContent.match(additionalNetworkPattern)) {
          configContent = configContent.replace(additionalNetworkPattern, `$1'${contractAddress}'$3`);
          updated = true;
          console.log(`  ✅ Updated ${networkName}.${propName} = ${contractAddress} in ADDITIONAL_NETWORKS`);
          break;
        }
      }
      
      // 2. Add property if not in ADDITIONAL_NETWORKS
      if (!updated) {
        const propName = possibleProps[0]; // use default value
        const networkEndPattern = new RegExp(
          `(${networkName}:\\s*{[^}]*)(\\s*nativeCurrency:\\s*'[^']*'\\s*)(\\s*})`,
          'gs'
        );
        
        if (configContent.match(networkEndPattern)) {
          configContent = configContent.replace(networkEndPattern, 
            `$1$2,\n    ${propName}: '${contractAddress}'$3`
          );
          updated = true;
          console.log(`  ✅ Added ${networkName}.${propName} = ${contractAddress} to ADDITIONAL_NETWORKS`);
        }
      }
      
      // 3. Direct update in NETWORKS definition (fallback)
      if (!updated) {
        for (const propName of possibleProps) {
          const directNetworkPattern = new RegExp(
            `(${networkName}:\\s*{[^}]*${propName}:\\s*)(?:null|'[^']*')([^,}]*)`, 
            'gs'
          );
          
          if (configContent.match(directNetworkPattern)) {
            configContent = configContent.replace(directNetworkPattern, `$1'${contractAddress}'$2`);
            updated = true;
            console.log(`  ✅ Updated ${networkName}.${propName} = ${contractAddress} in NETWORKS`);
            break;
          }
        }
      }
      
      // Write file
      if (updated) {
        fs.writeFileSync(configPath, configContent, 'utf8');
      } else {
        console.log(`  ⚠️ Could not find ${networkName}.${contractName} to update`);
        console.log(`  📝 Tried properties: ${possibleProps.join(', ')}`);
      }
      
    } catch (error) {
      console.error(`  ❌ Failed to update config for ${networkName}.${contractName}:`, error.message);
    }
  }

  async waitForTransactionReceipt(provider, txHash, timeout = 120000) {
    const start = Date.now();
    const interval = 5000; // check every 5 seconds
    
    while (Date.now() - start < timeout) {
      try {
        const receipt = await provider.getTransactionReceipt(txHash);
        if (receipt) {
          return receipt;
        }
      } catch (error) {
        console.log(`  🔄 Checking transaction status...`);
      }
      
      await this.sleep(interval);
    }
    
    throw new Error(`Transaction receipt timeout after ${timeout/1000}s`);
  }

  async checkTransactionWithFallback(config, txHash) {
    // Check transaction status with other RPCs
    const fallbackRpcs = [
      'https://gnosis.publicnode.com',
      'https://endpoints.omniatech.io/v1/gnosis/mainnet/public',
      'https://gnosis-rpc.publicnode.com',
      'https://1rpc.io/gnosis'
    ];
    
    for (const rpcUrl of fallbackRpcs) {
      try {
        console.log(`  🔍 Checking with ${rpcUrl.substring(0, 40)}...`);
        const provider = new ethers.providers.JsonRpcProvider({
          url: rpcUrl,
          timeout: 30000
        });
        
        const receipt = await provider.getTransactionReceipt(txHash);
        if (receipt) {
          console.log(`  ✅ Transaction confirmed via fallback RPC`);
          return receipt;
        }
        
        // Check if transaction is still pending
        const tx = await provider.getTransaction(txHash);
        if (tx && !tx.blockNumber) {
          console.log(`  ⏳ Transaction is pending, continuing to wait...`);
          await this.sleep(10000); // wait 10 more seconds
          const receipt2 = await provider.getTransactionReceipt(txHash);
          if (receipt2) return receipt2;
        }
        
      } catch (error) {
        console.log(`  ⚠️ Fallback RPC ${rpcUrl.substring(0, 40)} failed: ${error.message}`);
        continue;
      }
    }
    
    throw new Error(`Transaction ${txHash} could not be confirmed with any RPC`);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution function
async function main() {
  const deployer = new DirectDeployer();
  
  try {
    console.log("🌟 Direct RPC Contract Deployment");
    console.log("=" .repeat(60));
    console.log("📝 Bypassing Gelato, using direct RPC calls");
    
    // 1. Analyze deployment needs
    const needsDeployment = await deployer.analyzeDeploymentNeeds();
    
    if (!needsDeployment) {
      console.log("🎉 All target networks already have contracts deployed.");
      return;
    }
    
    // 2. Compile contracts
    await deployer.loadContractBytecodes();
    
    // 3. Direct RPC deployment
    await deployer.deployWithDirectRPC();
    
    // 4. Configuration update
    await deployer.generateNetworkConfigUpdate();
    
    // 5. Final report
    const summary = deployer.generateReport();
    
    if (summary.total > 0) {
      const successRate = (summary.success / summary.total) * 100;
      
      if (successRate >= 70) {
        console.log("✨ Direct deployment completed successfully!");
      } else {
        console.log("⚠️ Some deployments failed. Check wallet balance and network connectivity.");
      }
    }
    
  } catch (error) {
    console.error("💥 Direct deployment failed:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { DirectDeployer };