// Build deployment artifacts or perform read-only Sepolia readiness checks.
// Signing stays in MetaMask; this script never accepts private keys.
const fs = require('node:fs');
const path = require('node:path');
const solc = require('../tests/node_modules/solc');
const { ethers } = require('../tests/node_modules/ethers');
const root = path.resolve(__dirname, '..');
const CHAIN_ID = 11155111n;

function compile() {
  if (!solc.version().startsWith('0.8.24+')) throw Error('Solidity 0.8.24 required');
  const sources = Object.fromEntries(fs.readdirSync(path.join(root, 'contracts'))
    .filter(n => n.endsWith('.sol')).sort()
    .map(n => [`contracts/${n}`, { content: fs.readFileSync(path.join(root, 'contracts', n), 'utf8') }]));
  const input = { language: 'Solidity', sources, settings: {
    optimizer: { enabled: false, runs: 200 }, evmVersion: 'shanghai',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } }
  } };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors?.length) throw Error(JSON.stringify(output.errors));
  const artifacts = Object.fromEntries(['Reputation', 'LendLoop'].map(name => {
    const c = output.contracts[`contracts/${name}.sol`][name];
    if (c.evm.deployedBytecode.object.length / 2 > 24576) throw Error(`${name} exceeds runtime size limit`);
    return [name, { abi: c.abi, bytecode: `0x${c.evm.bytecode.object}` }];
  }));
  return { input, artifacts, compiler: solc.version() };
}

async function preflight(provider, addresses) {
  const network = await provider.getNetwork();
  if (network.chainId !== CHAIN_ID) throw Error('Wrong network: Ethereum Sepolia chain 11155111 required');
  if (addresses.length < 3 || addresses.length > 4) throw Error('Supply 3–4 public addresses: admin, lender, borrower(s)');
  const normalized = addresses.map(a => ethers.getAddress(a));
  if (normalized.some(a => a === ethers.ZeroAddress) || new Set(normalized).size !== normalized.length)
    throw Error('Accounts must be distinct, nonzero addresses');
  const fee = await provider.getFeeData();
  const gasPrice = fee.maxFeePerGas ?? fee.gasPrice;
  if (gasPrice === null) throw Error('RPC did not return a gas price');
  // Conservative planning allowances; wallet estimates are authoritative at signing time.
  const gasBudgets = [8000000n, 1500000n, 1500000n, 1500000n];
  const roles = ['Admin', 'Lender', 'Borrower', 'Borrower 2'];
  const rows = [];
  for (let i = 0; i < normalized.length; i++) {
    const balance = await provider.getBalance(normalized[i]);
    const suggested = gasBudgets[i] * gasPrice + (i >= 2 ? ethers.parseEther('0.002') : 0n);
    rows.push({ role: roles[i], address: normalized[i], balanceETH: ethers.formatEther(balance),
      suggestedETH: ethers.formatEther(suggested), ready: balance >= suggested });
  }
  return rows;
}

async function main() {
  const [command, ...addresses] = process.argv.slice(2);
  if (command === 'build') {
    const build = compile();
    const dir = path.join(root, 'build/sepolia');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'standard-input.json'), JSON.stringify(build.input, null, 2));
    for (const [name, artifact] of Object.entries(build.artifacts))
      fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(artifact, null, 2));
    console.log(`Built ${build.compiler}; Shanghai EVM, optimizer off. Files: ${dir}`);
    return;
  }
  if (command !== 'preflight' || !process.env.SEPOLIA_RPC_URL)
    throw Error('Usage: node scripts/sepolia.cjs build | preflight ADMIN LENDER BORROWER [BORROWER2]\nPreflight requires SEPOLIA_RPC_URL. Public addresses only.');
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  try {
    const rows = await preflight(provider, addresses);
    console.table(rows);
    if (rows.some(r => !r.ready)) { console.error('Funding below suggested demo budget.'); process.exitCode = 1; }
  } finally { provider.destroy(); }
}

module.exports = { compile, preflight };
if (require.main === module) main().catch(() => {
  // RPC errors may contain provider credentials; never print the configured URL.
  console.error('Sepolia preparation failed. Check command, RPC connection, chain ID, and public addresses.');
  process.exitCode = 1;
});
