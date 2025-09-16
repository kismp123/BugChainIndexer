const path = require('path');
const { readFile } = require('fs/promises');

async function loadTokenList(network) {
  const file = path.resolve(__dirname, '..', 'tokens', `${network}.json`);
  const raw = await readFile(file, 'utf8');
  return JSON.parse(raw);
}

async function loadTokenAddresses(network) {
  const list = await loadTokenList(network);
  return list.map(d => d.address || d['address']);
}

module.exports = {
  loadTokenList,
  loadTokenAddresses,
};

