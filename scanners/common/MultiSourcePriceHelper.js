const axios = require('axios');

class MultiSourcePriceHelper {
    constructor() {
        this.cache = new Map();
        this.cacheExpiry = 60000; // 1분 캐시
        
        // API 우선순위
        this.sources = {
            binance: { enabled: true, priority: 1 },
            kraken: { enabled: true, priority: 2 },
            coinbase: { enabled: true, priority: 3 },
            cryptocompare: { enabled: true, priority: 4 },
            coingecko: { enabled: true, priority: 5 }
        };
    }
    
    // Main price fetching method
    async getPrice(symbol, preferredSource = null) {
        // Check cache
        const cached = this.getFromCache(symbol);
        if (cached) return cached;
        
        let price = null;
        let source = null;
        
        // Try preferred source first if specified
        if (preferredSource && this.sources[preferredSource]?.enabled) {
            const result = await this.getPriceFromSource(symbol, preferredSource);
            if (result) {
                price = result.price;
                source = result.source;
            }
        }
        
        // Try sources by priority
        if (!price) {
            const sortedSources = Object.entries(this.sources)
                .filter(([_, config]) => config.enabled)
                .sort((a, b) => a[1].priority - b[1].priority);
            
            for (const [sourceName] of sortedSources) {
                const result = await this.getPriceFromSource(symbol, sourceName);
                if (result) {
                    price = result.price;
                    source = result.source;
                    break;
                }
            }
        }
        
        // Save to cache
        if (price) {
            this.saveToCache(symbol, price, source);
        }
        
        return price;
    }
    
    async getPriceFromSource(symbol, source) {
        try {
            switch(source) {
                case 'binance':
                    return await this.getBinancePrice(symbol);
                case 'kraken':
                    return await this.getKrakenPrice(symbol);
                case 'coinbase':
                    return await this.getCoinbasePrice(symbol);
                case 'cryptocompare':
                    return await this.getCryptoComparePrice(symbol);
                case 'coingecko':
                    return await this.getCoinGeckoPrice(symbol);
                default:
                    return null;
            }
        } catch (error) {
            return null;
        }
    }
    
    // 1. Binance API
    async getBinancePrice(symbol) {
        try {
            const pair = `${symbol.toUpperCase()}USDT`;
            const response = await axios.get('https://api.binance.com/api/v3/ticker/price', {
                params: { symbol: pair },
                timeout: 3000
            });
            
            if (response.data?.price) {
                return {
                    price: parseFloat(response.data.price),
                    source: 'binance'
                };
            }
        } catch (error) {
            // Silent fail
        }
        return null;
    }
    
    // 2. Kraken API
    async getKrakenPrice(symbol) {
        try {
            const upperSymbol = symbol.toUpperCase();
            
            // Special mappings for certain tokens
            const specialPairs = {
                'ETH': 'XETHZUSD',
                'BTC': 'XXBTZUSD'
            };
            
            // Use special mapping if exists, otherwise use default format
            const pair = specialPairs[upperSymbol] || `${upperSymbol}USD`;
            
            // Wrapped tokens like WBTC, WETH are not supported by Kraken
            const unsupportedTokens = ['WBTC', 'WETH', 'WSTETH', 'STETH', 'CBBTC'];
            if (unsupportedTokens.includes(upperSymbol)) {
                return null;
            }
            
            const response = await axios.get('https://api.kraken.com/0/public/Ticker', {
                params: { pair },
                timeout: 3000
            });
            
            const data = response.data?.result?.[pair];
            if (data?.c?.[0]) {
                return {
                    price: parseFloat(data.c[0]),
                    source: 'kraken'
                };
            }
        } catch (error) {
            // Silent fail
        }
        return null;
    }
    
    // 3. Coinbase API
    async getCoinbasePrice(symbol) {
        try {
            const response = await axios.get(`https://api.coinbase.com/v2/exchange-rates`, {
                params: { currency: symbol.toUpperCase() },
                timeout: 3000
            });
            
            const usdRate = response.data?.data?.rates?.USD;
            if (usdRate) {
                return {
                    price: parseFloat(usdRate),
                    source: 'coinbase'
                };
            }
        } catch (error) {
            // Silent fail
        }
        return null;
    }
    
    // 4. CryptoCompare API
    async getCryptoComparePrice(symbol) {
        try {
            const response = await axios.get('https://min-api.cryptocompare.com/data/price', {
                params: {
                    fsym: symbol.toUpperCase(),
                    tsyms: 'USD'
                },
                timeout: 3000
            });
            
            if (response.data?.USD) {
                return {
                    price: response.data.USD,
                    source: 'cryptocompare'
                };
            }
        } catch (error) {
            // Silent fail
        }
        return null;
    }
    
    // 5. CoinGecko Free API
    async getCoinGeckoPrice(symbol) {
        try {
            // Extended CoinGecko ID mappings
            const geckoIds = {
                'ETH': 'ethereum',
                'BTC': 'bitcoin',
                'USDC': 'usd-coin',
                'USDT': 'tether',
                'BNB': 'binancecoin',
                'MATIC': 'matic-network',
                'AVAX': 'avalanche-2',
                'LINK': 'chainlink',
                'UNI': 'uniswap',
                'AAVE': 'aave',
                'WBTC': 'wrapped-bitcoin',
                'SHIB': 'shiba-inu',
                'CRO': 'crypto-com-coin',
                'DAI': 'dai',
                'ARB': 'arbitrum',
                'OP': 'optimism',
                'DOT': 'polkadot',
                'SOL': 'solana',
                'ATOM': 'cosmos',
                'XRP': 'ripple',
                'ADA': 'cardano',
                'WETH': 'weth',
                'STETH': 'staked-ether',
                'WSTETH': 'wrapped-steth',
                'LEO': 'leo-token',
                'TON': 'the-open-network',
                'TONCOIN': 'the-open-network',
                'APE': 'apecoin',
                'MKR': 'maker',
                'SNX': 'synthetix-network-token',
                'COMP': 'compound-governance-token',
                'YFI': 'yearn-finance',
                'SUSHI': 'sushi',
                'CRV': 'curve-dao-token',
                'BAL': 'balancer',
                'INCH': '1inch',
                '1INCH': '1inch',
                'FTM': 'fantom',
                'GLMR': 'moonbeam',
                'MOVR': 'moonriver',
                'CELO': 'celo',
                'MNT': 'mantle',
                'METIS': 'metis-token',
                'XDAI': 'xdai'
            };
            
            const id = geckoIds[symbol.toUpperCase()];
            if (!id) {
                // If no mapping, try direct symbol lookup (lowercase)
                return this.getCoinGeckoDirectPrice(symbol);
            }
            
            const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
                params: {
                    ids: id,
                    vs_currencies: 'usd'
                },
                timeout: 5000
            });
            
            if (response.data?.[id]?.usd) {
                return {
                    price: response.data[id].usd,
                    source: 'coingecko'
                };
            }
        } catch (error) {
            // Silent fail
        }
        return null;
    }
    
    // Direct CoinGecko symbol lookup (when no ID mapping exists)
    async getCoinGeckoDirectPrice(symbol) {
        try {
            // Try symbol as ID in lowercase
            const id = symbol.toLowerCase();
            const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
                params: {
                    ids: id,
                    vs_currencies: 'usd'
                },
                timeout: 5000
            });
            
            if (response.data?.[id]?.usd) {
                return {
                    price: response.data[id].usd,
                    source: 'coingecko'
                };
            }
        } catch (error) {
            // Silent fail
        }
        return null;
    }
    
    // Bulk price fetching
    async getBulkPrices(symbols) {
        const prices = {};
        
        // Try Binance bulk fetch
        try {
            const response = await axios.get('https://api.binance.com/api/v3/ticker/price', {
                timeout: 5000
            });
            
            if (response.data && Array.isArray(response.data)) {
                const binancePrices = {};
                response.data.forEach(ticker => {
                    const symbol = ticker.symbol.replace('USDT', '').replace('BUSD', '').replace('USDC', '');
                    binancePrices[symbol] = parseFloat(ticker.price);
                });
                
                for (const symbol of symbols) {
                    const upperSymbol = symbol.toUpperCase();
                    if (binancePrices[upperSymbol]) {
                        prices[symbol] = binancePrices[upperSymbol];
                        this.saveToCache(symbol, binancePrices[upperSymbol], 'binance');
                    }
                }
            }
        } catch (error) {
            console.error('Binance bulk fetch failed:', error.message);
        }
        
        // Fetch remaining symbols individually
        for (const symbol of symbols) {
            if (!prices[symbol]) {
                const price = await this.getPrice(symbol);
                if (price) {
                    prices[symbol] = price;
                }
            }
        }
        
        return prices;
    }
    
    // Cache management
    getFromCache(symbol) {
        const cached = this.cache.get(symbol.toUpperCase());
        if (cached && (Date.now() - cached.timestamp < this.cacheExpiry)) {
            return cached.price;
        }
        return null;
    }
    
    saveToCache(symbol, price, source) {
        this.cache.set(symbol.toUpperCase(), {
            price,
            source,
            timestamp: Date.now()
        });
    }
    
    // Statistics
    getStats() {
        const stats = {
            cacheSize: this.cache.size,
            sources: {}
        };
        
        this.cache.forEach(item => {
            stats.sources[item.source] = (stats.sources[item.source] || 0) + 1;
        });
        
        return stats;
    }
    
    clearCache() {
        this.cache.clear();
    }
}

module.exports = MultiSourcePriceHelper;