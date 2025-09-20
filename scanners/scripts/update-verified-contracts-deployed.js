#!/usr/bin/env node
/**
 * Update deployment times for verified contracts (deployed=0)
 * Also updates tags based on results
 */

const { Pool } = require('pg');
const axios = require('axios');
require('dotenv').config();

class DeploymentUpdater {
  constructor() {
    this.pool = new Pool({
      host: process.env.PGHOST || 'localhost',
      port: process.env.PGPORT || 5432,
      database: process.env.PGDATABASE || 'bugchain_indexer',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || ''
    });
    
    this.apiKeys = (process.env.DEFAULT_ETHERSCAN_KEYS || '').split(',');
    this.currentKeyIndex = 0;
    this.requestCount = 0;
    this.maxRequestsPerKey = 100; // Conservative limit
    
    this.stats = {
      total: 0,
      processed: 0,
      updated: 0,
      genesis: 0,
      noData: 0,
      eoa: 0,
      errors: 0
    };
  }

  getNextApiKey() {
    this.requestCount++;
    if (this.requestCount >= this.maxRequestsPerKey) {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
      this.requestCount = 0;
      console.log(`🔄 Rotating to API key ${this.currentKeyIndex + 1}/${this.apiKeys.length}`);
    }
    return this.apiKeys[this.currentKeyIndex];
  }

  async getContractsToUpdate(limit = 100) {
    const query = `
      SELECT address, network, tags, first_seen
      FROM addresses 
      WHERE deployed = 0 
        AND tags @> ARRAY['Contract', 'Verified']::text[]
      ORDER BY network, address
      LIMIT $1
    `;
    
    const result = await this.pool.query(query, [limit]);
    return result.rows;
  }

  getChainId(network) {
    const chainIds = {
      'ethereum': 1,
      'optimism': 10,
      'binance': 56,
      'bsc': 56,
      'gnosis': 100,
      'polygon': 137,
      'base': 8453,
      'arbitrum': 42161,
      'avalanche': 43114,
      'linea': 59144,
      'mantle': 5000,
      'opbnb': 204
    };
    return chainIds[network.toLowerCase()] || null;
  }

  async checkIfContract(address, chainId) {
    try {
      const response = await axios.get('https://api.etherscan.io/v2/api', {
        params: {
          module: 'proxy',
          action: 'eth_getCode',
          address: address,
          tag: 'latest',
          chainid: chainId,
          apikey: this.getNextApiKey()
        },
        timeout: 5000
      });
      
      const code = response.data.result;
      return code && code !== '0x' && code !== '0x0';
    } catch (error) {
      console.error(`Error checking contract code: ${error.message}`);
      return null;
    }
  }

  async getDeploymentTime(address, chainId) {
    try {
      const response = await axios.get('https://api.etherscan.io/v2/api', {
        params: {
          module: 'contract',
          action: 'getcontractcreation',
          contractaddresses: address,
          chainid: chainId,
          apikey: this.getNextApiKey()
        },
        timeout: 5000
      });
      
      if (response.data.status === '1' && response.data.result?.length > 0) {
        const creation = response.data.result[0];
        
        // Check for genesis contract
        if (creation.txHash && creation.txHash.startsWith('GENESIS')) {
          const genesisTimestamps = {
            1: 1438269973,    // Ethereum
            10: 1636665385,   // Optimism
            56: 1598671449,   // BSC
            100: 1546605375,  // Gnosis
            137: 1590824836,  // Polygon
            8453: 1686789347, // Base
            42161: 1622243344, // Arbitrum
            43114: 1600961380, // Avalanche
            59144: 1689593539, // Linea
            5000: 1687860000,  // Mantle
            204: 1691753542    // opBNB
          };
          
          return {
            deployed: genesisTimestamps[chainId] || null,
            isGenesis: true,
            txHash: creation.txHash
          };
        }
        
        // Get actual deployment timestamp
        if (creation.txHash) {
          try {
            const txResponse = await axios.get('https://api.etherscan.io/v2/api', {
              params: {
                module: 'proxy',
                action: 'eth_getTransactionByHash',
                txhash: creation.txHash,
                chainid: chainId,
                apikey: this.getNextApiKey()
              },
              timeout: 5000
            });
            
            if (txResponse.data.result?.blockNumber) {
              const blockResponse = await axios.get('https://api.etherscan.io/v2/api', {
                params: {
                  module: 'proxy',
                  action: 'eth_getBlockByNumber',
                  tag: txResponse.data.result.blockNumber,
                  boolean: false,
                  chainid: chainId,
                  apikey: this.getNextApiKey()
                },
                timeout: 5000
              });
              
              if (blockResponse.data.result?.timestamp) {
                return {
                  deployed: parseInt(blockResponse.data.result.timestamp, 16),
                  isGenesis: false,
                  txHash: creation.txHash
                };
              }
            }
          } catch (error) {
            console.error(`Error getting tx/block data: ${error.message}`);
          }
        }
      }
      
      // Check if it's a "No data found" response
      const message = response.data.message || '';
      if (message.toLowerCase().includes('no data found')) {
        // No data found often means it's an EOA, not a contract
        return { noData: true, likelyEOA: true };
      }
      
      return null;
    } catch (error) {
      console.error(`Error getting deployment time: ${error.message}`);
      return null;
    }
  }

  async updateAddress(address, network, deploymentData) {
    const { deployed, isGenesis, noData } = deploymentData;
    
    let updateQuery;
    let params;
    
    if (deployed) {
      // Update deployed time and add genesis tag if needed
      if (isGenesis) {
        updateQuery = `
          UPDATE addresses 
          SET deployed = $1,
              tags = array_append(
                CASE 
                  WHEN NOT tags @> ARRAY['genesis']::text[] 
                  THEN tags 
                  ELSE tags 
                END, 
                'genesis'
              ),
              last_updated = $2
          WHERE address = $3 AND network = $4
        `;
      } else {
        updateQuery = `
          UPDATE addresses 
          SET deployed = $1,
              last_updated = $2
          WHERE address = $3 AND network = $4
        `;
      }
      params = [deployed, Math.floor(Date.now() / 1000), address, network];
    } else if (noData) {
      // No deployment data found - keep first_seen as fallback
      // Don't update deployed, but mark as processed
      updateQuery = `
        UPDATE addresses 
        SET last_updated = $1
        WHERE address = $2 AND network = $3
      `;
      params = [Math.floor(Date.now() / 1000), address, network];
    } else {
      return false;
    }
    
    await this.pool.query(updateQuery, params);
    return true;
  }

  async processContract(contract) {
    const { address, network, tags, first_seen } = contract;
    const chainId = this.getChainId(network);
    
    if (!chainId) {
      console.log(`⚠️  Unknown network: ${network}`);
      this.stats.errors++;
      return;
    }
    
    console.log(`\n📍 Processing ${address} on ${network}`);
    
    // First verify it's actually a contract
    const hasCode = await this.checkIfContract(address, chainId);
    
    if (hasCode === false) {
      console.log(`  ❌ Not a contract (EOA) - removing Contract tags`);
      
      // Remove Contract and Verified tags, add EOA tag if not present
      const updateQuery = `
        UPDATE addresses 
        SET tags = array_remove(array_remove(
              CASE 
                WHEN NOT tags @> ARRAY['EOA']::text[] 
                THEN array_append(tags, 'EOA')
                ELSE tags
              END, 
              'Contract'), 
              'Verified'),
            last_updated = $1
        WHERE address = $2 AND network = $3
      `;
      
      await this.pool.query(updateQuery, [Math.floor(Date.now() / 1000), address, network]);
      this.stats.eoa++;
      return;
    }
    
    if (hasCode === null) {
      console.log(`  ⚠️  Failed to check contract code`);
      this.stats.errors++;
      return;
    }
    
    // Get deployment time
    const deploymentData = await this.getDeploymentTime(address, chainId);
    
    if (!deploymentData) {
      console.log(`  ⚠️  Failed to get deployment data`);
      this.stats.errors++;
      return;
    }
    
    if (deploymentData.isGenesis) {
      console.log(`  🌟 Genesis contract - deployed at genesis`);
      this.stats.genesis++;
    } else if (deploymentData.deployed) {
      const deployDate = new Date(deploymentData.deployed * 1000);
      const firstSeenDate = new Date(first_seen * 1000);
      console.log(`  ✅ Deployed: ${deployDate.toISOString()}`);
      
      if (deploymentData.deployed < first_seen) {
        const daysDiff = Math.floor((first_seen - deploymentData.deployed) / 86400);
        console.log(`  📅 Deployment is ${daysDiff} days before first_seen`);
      }
      this.stats.updated++;
    } else if (deploymentData.noData) {
      if (deploymentData.likelyEOA) {
        console.log(`  ⚠️  No deployment data - likely EOA, updating tags`);
        // Remove Contract and Verified tags, add EOA tag
        const updateQuery = `
          UPDATE addresses 
          SET tags = array_remove(array_remove(
                CASE 
                  WHEN NOT tags @> ARRAY['EOA']::text[] 
                  THEN array_append(tags, 'EOA')
                  ELSE tags
                END, 
                'Contract'), 
                'Verified'),
              last_updated = $1
          WHERE address = $2 AND network = $3
        `;
        
        await this.pool.query(updateQuery, [Math.floor(Date.now() / 1000), address, network]);
        this.stats.eoa++;
        return;
      } else {
        console.log(`  ℹ️  No deployment data available - keeping first_seen`);
        this.stats.noData++;
      }
    }
    
    await this.updateAddress(address, network, deploymentData);
    
    // Rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  async run(batchSize = 100) {
    console.log('🚀 Starting Verified Contracts Deployment Time Update');
    console.log('=' .repeat(60));
    
    try {
      // Get total count
      const countResult = await this.pool.query(
        "SELECT COUNT(*) FROM addresses WHERE deployed = 0 AND tags @> ARRAY['Contract', 'Verified']::text[]"
      );
      this.stats.total = parseInt(countResult.rows[0].count);
      
      console.log(`\n📊 Found ${this.stats.total} verified contracts with deployed=0\n`);
      
      while (this.stats.processed < this.stats.total) {
        const contracts = await this.getContractsToUpdate(batchSize);
        
        if (contracts.length === 0) break;
        
        console.log(`\n🔄 Processing batch: ${this.stats.processed + 1}-${this.stats.processed + contracts.length} of ${this.stats.total}`);
        
        for (const contract of contracts) {
          await this.processContract(contract);
          this.stats.processed++;
          
          // Progress update every 10 contracts
          if (this.stats.processed % 10 === 0) {
            const progress = ((this.stats.processed / this.stats.total) * 100).toFixed(1);
            console.log(`\n📈 Progress: ${progress}% (${this.stats.processed}/${this.stats.total})`);
          }
        }
        
        // Longer pause between batches
        await new Promise(r => setTimeout(r, 1000));
      }
      
      // Final summary
      console.log('\n' + '='.repeat(60));
      console.log('📊 FINAL SUMMARY\n');
      console.log(`Total processed: ${this.stats.processed}`);
      console.log(`✅ Updated with deployment time: ${this.stats.updated}`);
      console.log(`🌟 Genesis contracts: ${this.stats.genesis}`);
      console.log(`ℹ️  No deployment data (kept as contract): ${this.stats.noData}`);
      console.log(`❌ Found to be EOAs (tags updated): ${this.stats.eoa}`);
      console.log(`⚠️  Errors: ${this.stats.errors}`);
      
      const successRate = ((this.stats.updated + this.stats.genesis) / this.stats.processed * 100).toFixed(1);
      console.log(`\n🎯 Success rate: ${successRate}%`);
      
    } catch (error) {
      console.error('❌ Fatal error:', error);
    } finally {
      await this.pool.end();
    }
  }
}

// Run if called directly
if (require.main === module) {
  const updater = new DeploymentUpdater();
  const batchSize = process.argv[2] ? parseInt(process.argv[2]) : 100;
  
  updater.run(batchSize)
    .then(() => {
      console.log('\n✅ Update completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Update failed:', error);
      process.exit(1);
    });
}

module.exports = DeploymentUpdater;