const fs = require('fs');
const path = require('path');

class TokenDataLoader {
    constructor() {
        this.tokensByNetwork = new Map(); // network -> array of {rank, name, symbol, address}
        this.tokensByAddress = new Map(); // network:address -> {rank, name, symbol, address}
        this.tokensDir = path.join(__dirname, '..', 'tokens');
        this.loaded = false;
    }

    async loadTokenInfo() {
        if (this.loaded) return;
        
        console.log('Loading token info from JSON files...');
        
        try {
            const files = fs.readdirSync(this.tokensDir).filter(f => f.endsWith('.json'));
            
            for (const file of files) {
                const network = file.replace('.json', '');
                const filePath = path.join(this.tokensDir, file);
                
                try {
                    const fileContent = fs.readFileSync(filePath, 'utf8');
                    let tokenData = [];
                    
                    // Parse JSON data
                    const data = JSON.parse(fileContent);
                    
                    // Handle both formats: array directly or object with tokens property
                    if (Array.isArray(data)) {
                        tokenData = data;
                    } else if (data.tokens && Array.isArray(data.tokens)) {
                        tokenData = data.tokens;
                    }
                    
                    // Process tokens
                    const tokenInfo = tokenData.map(t => ({
                        rank: t.rank || 0,
                        name: t.name || '',
                        symbol: t.symbol || '',
                        address: t.address ? t.address.toLowerCase() : ''
                    })).filter(t => t.address && t.address !== ''); // Only keep tokens with valid addresses
                    
                    this.tokensByNetwork.set(network, tokenInfo);
                    
                    // Index by address for quick lookup
                    for (const token of tokenInfo) {
                        const key = `${network}:${token.address}`;
                        this.tokensByAddress.set(key, token);
                    }
                    
                    // Log statistics for this network
                    const withSymbol = tokenInfo.filter(t => t.symbol).length;
                    console.log(`  ${network}: ${tokenInfo.length} tokens (${withSymbol} with symbols)`);
                    
                } catch (error) {
                    console.error(`Error loading ${file}:`, error.message);
                }
            }
            
            this.loaded = true;
            console.log(`\nTotal: ${this.tokensByAddress.size} tokens from ${files.length} networks`);
            
        } catch (error) {
            console.error('Error loading token info:', error.message);
        }
    }

    async getTokenInfo(address, network = 'ethereum') {
        await this.loadTokenInfo();
        
        const key = `${network}:${address.toLowerCase()}`;
        return this.tokensByAddress.get(key) || null;
    }

    async getTokensByNetwork(network = 'ethereum') {
        await this.loadTokenInfo();
        return this.tokensByNetwork.get(network) || [];
    }

    async getTopTokensByNetwork(network = 'ethereum', limit = 100) {
        await this.loadTokenInfo();
        const tokens = this.tokensByNetwork.get(network) || [];
        // Already sorted by rank in the JSON files
        return tokens.slice(0, limit);
    }

    async getAllTokenAddresses(network = 'ethereum') {
        await this.loadTokenInfo();
        const tokens = this.tokensByNetwork.get(network) || [];
        return tokens.map(t => t.address);
    }

    async getTokenSymbols(addresses, network = 'ethereum') {
        await this.loadTokenInfo();
        
        const result = [];
        for (const address of addresses) {
            const info = await this.getTokenInfo(address, network);
            if (info) {
                result.push({
                    rank: info.rank,
                    address: address.toLowerCase(),
                    symbol: info.symbol,
                    name: info.name
                });
            }
        }
        return result;
    }

    async getTokensWithSymbols(network = 'ethereum') {
        await this.loadTokenInfo();
        const tokens = this.tokensByNetwork.get(network) || [];
        return tokens.filter(t => t.symbol && t.symbol !== '');
    }

    async getTokensWithoutSymbols(network = 'ethereum') {
        await this.loadTokenInfo();
        const tokens = this.tokensByNetwork.get(network) || [];
        return tokens.filter(t => !t.symbol || t.symbol === '');
    }

    async searchTokenBySymbol(symbol, network = null) {
        await this.loadTokenInfo();
        
        const results = [];
        const searchSymbol = symbol.toUpperCase();
        
        if (network) {
            // Search in specific network
            const tokens = this.tokensByNetwork.get(network) || [];
            const found = tokens.find(t => t.symbol && t.symbol.toUpperCase() === searchSymbol);
            if (found) results.push({ ...found, network });
        } else {
            // Search in all networks
            for (const [net, tokens] of this.tokensByNetwork.entries()) {
                const found = tokens.find(t => t.symbol && t.symbol.toUpperCase() === searchSymbol);
                if (found) results.push({ ...found, network: net });
            }
        }
        
        return results;
    }

    getAvailableNetworks() {
        return Array.from(this.tokensByNetwork.keys());
    }

    getStatistics() {
        const stats = {
            totalNetworks: this.tokensByNetwork.size,
            totalTokens: this.tokensByAddress.size,
            byNetwork: {}
        };
        
        for (const [network, tokens] of this.tokensByNetwork.entries()) {
            stats.byNetwork[network] = {
                total: tokens.length,
                withSymbol: tokens.filter(t => t.symbol).length,
                withoutSymbol: tokens.filter(t => !t.symbol).length
            };
        }
        
        return stats;
    }
}

module.exports = TokenDataLoader;