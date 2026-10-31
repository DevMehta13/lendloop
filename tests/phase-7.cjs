const assert = require('node:assert/strict');
const ganache = require('ganache');
const { ethers } = require('ethers');
const { compile, preflight } = require('../scripts/sepolia.cjs');

async function main() {
  const { artifacts } = compile();
  const chain = ganache.provider({ logging: { quiet: true }, chain: { chainId: 31337 } });
  const provider = new ethers.BrowserProvider(chain);
  provider.pollingInterval = 10;
  try {
    const [admin, lender, borrower] = await Promise.all([0, 1, 2].map(i => provider.getSigner(i)));
    const addresses = await Promise.all([admin, lender, borrower].map(s => s.getAddress()));
    await assert.rejects(preflight(provider, addresses), /Wrong network/);
    // Mock only network/funding reads to exercise preflight without claiming public-chain validation.
    const readOnly = { getNetwork: async () => ({ chainId: 11155111n }),
      getFeeData: async () => ({ maxFeePerGas: 1000000000n }), getBalance: async () => ethers.parseEther('1') };
    await assert.rejects(preflight(readOnly, [addresses[0], addresses[0], addresses[2]]), /distinct/);
    await assert.rejects(preflight(readOnly, addresses.slice(0, 2)), /3–4/);
    assert.ok((await preflight(readOnly, addresses)).every(r => r.ready));
    assert.ok((await preflight({ ...readOnly, getBalance: async () => 0n }, addresses)).every(r => !r.ready));
    const deploy = async (name, args = []) => {
      const a = artifacts[name];
      const c = await new ethers.ContractFactory(a.abi, a.bytecode, admin).deploy(...args);
      await c.waitForDeployment(); return c;
    };
    const rep = await deploy('Reputation');
    const loop = await deploy('LendLoop', [rep.target, 60]);
    const send = async tx => (await tx).wait();
    await send(rep.setLendLoop(loop.target));
    assert.equal(await rep.lendLoop(), loop.target);
    for (const a of addresses.slice(1)) await send(loop.registerStudent(a));
    const ll = loop.connect(lender), lb = loop.connect(borrower);
    const rent = ethers.parseEther('0.0001'), deposit = ethers.parseEther('0.001');
    await send(ll['listItem(string,uint256,uint256,uint256,uint256)']('Sepolia calculator', rent, deposit, rent, 10));
    const q = await loop.requiredPayment(1, 10, addresses[2]);
    assert.equal(q.total, rent * 10n + deposit);
    await send(lb.requestRental(1, 10, { value: q.total }));
    await send(ll.approveRental(1));
    await send(lb.confirmHandover(1));
    await send(lb.markReturned(1));
    await send(ll.confirmReturn(1));
    assert.equal((await loop.getRental(1)).status, 4n);
    assert.equal(await loop.pendingBalance(addresses[1]), rent * 10n);
    assert.equal(await loop.pendingBalance(addresses[2]), deposit);
    await send(lb.rateUser(1, 5)); await send(ll.rateUser(1, 5));
    assert.equal(await rep.discountPercent(addresses[2]), 10n);
    assert.equal((await loop.requiredPayment(1, 10, addresses[2])).total, rent * 10n + deposit * 9n / 10n);
    await send(ll.withdraw()); await send(lb.withdraw());
    assert.equal(await loop.contractBalance(), 0n);
    console.log('PASS Phase 7 preparation: pinned build, preflight guards, small-value rehearsal, ratings, discount, withdrawals; local chain only.');
  } finally { provider.destroy(); await chain.disconnect(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
