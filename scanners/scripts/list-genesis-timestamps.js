#!/usr/bin/env node
/**
 * List all genesis timestamps with detailed information
 */

const {
  GENESIS_TIMESTAMPS,
  getSupportedChainIds
} = require('../config/genesis-timestamps');

function formatDate(timestamp) {
  const date = new Date(timestamp * 1000);
  return date.toISOString().split('T')[0];
}

function getAge(timestamp) {
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  const years = Math.floor(diff / (365 * 24 * 60 * 60));
  const months = Math.floor((diff % (365 * 24 * 60 * 60)) / (30 * 24 * 60 * 60));
  return `${years}y ${months}m`;
}

console.log('📅 Genesis Timestamps for All Networks\n');
console.log('=' . repeat(80));
console.log(
  'Chain ID'.padEnd(10) +
  'Network'.padEnd(20) +
  'Genesis Date'.padEnd(14) +
  'Timestamp'.padEnd(12) +
  'Age'
);
console.log('-'.repeat(80));

// Sort by timestamp (oldest first)
const sorted = getSupportedChainIds()
  .map(id => ({
    chainId: id,
    ...GENESIS_TIMESTAMPS[id]
  }))
  .sort((a, b) => a.timestamp - b.timestamp);

sorted.forEach(network => {
  console.log(
    String(network.chainId).padEnd(10) +
    network.name.padEnd(20) +
    formatDate(network.timestamp).padEnd(14) +
    String(network.timestamp).padEnd(12) +
    getAge(network.timestamp)
  );
});

console.log('\n' + '='.repeat(80));
console.log(`Total Networks: ${sorted.length}`);
console.log(`Oldest: ${sorted[0].name} (${formatDate(sorted[0].timestamp)})`);
console.log(`Newest: ${sorted[sorted.length-1].name} (${formatDate(sorted[sorted.length-1].timestamp)})`);

// Group by year
const byYear = {};
sorted.forEach(network => {
  const year = new Date(network.timestamp * 1000).getFullYear();
  if (!byYear[year]) byYear[year] = [];
  byYear[year].push(network.name);
});

console.log('\n📊 Networks by Launch Year:');
Object.keys(byYear).sort().forEach(year => {
  console.log(`  ${year}: ${byYear[year].join(', ')}`);
});

console.log('\n✅ Done');