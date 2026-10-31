const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const solc = require('solc');
const ganache = require('ganache');
const { ethers } = require('ethers');

async function main() {
  const root = path.resolve(__dirname, '..');
  const sources = Object.fromEntries(fs.readdirSync(path.join(root, 'contracts'))
    .filter(name => name.endsWith('.sol'))
    .map(name => [`contracts/${name}`, { content: fs.readFileSync(path.join(root, 'contracts', name), 'utf8') }]));
  const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources,
    settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } } } })));
  assert.match(solc.version(), /^0\.8\.24\+/);
  assert.deepEqual(output.errors || [], [], 'Compile without warnings or errors');
  const size = output.contracts['contracts/LendLoop.sol'].LendLoop.evm.deployedBytecode.object.length / 2;
  assert.ok(size < 24576, 'Unoptimized runtime fits EIP-170');
  console.log(`PASS: Solidity ${solc.version()}, zero warnings/errors; LendLoop runtime ${size} bytes`);
  const chain = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 4 }, miner: { timestampIncrement: 0 } });
  try {
    const provider = new ethers.BrowserProvider(chain);
    provider.pollingInterval = 10;
    const [admin, lender, borrower, outsider] = await Promise.all(Array.from({ length: 4 }, (_, i) => provider.getSigner(i)));
    const [a, l, b, x] = await Promise.all([admin, lender, borrower, outsider].map(s => s.getAddress()));
    const send = async tx => (await tx).wait();
    const deploy = async name => {
      const artifact = output.contracts[`contracts/${name}.sol`][name];
      const args = name === 'LendLoop' ? [await rep.getAddress(), 60] : [];
      const contract = await new ethers.ContractFactory(artifact.abi, artifact.evm.bytecode.object, admin).deploy(...args);
      await contract.waitForDeployment();
      return contract;
    };
    const rep = await deploy('Reputation');
    const loop = await deploy('LendLoop');
    const address = await loop.getAddress();
    await send(rep.setLendLoop(address));
    await send(loop.registerStudent(l));
    await send(loop.registerStudent(b));
    const ll = loop.connect(lender), lb = loop.connect(borrower), lx = loop.connect(outsider);
    const rejects = async (call, reason) => {
      let failure;
      try { await call; } catch (error) { failure = error; }
      assert.ok(failure, `Expected rejection: ${reason}`);
      const detail = [failure.reason, failure.shortMessage, failure.info?.error?.message,
        failure.info?.error?.data?.reason, failure.message].filter(Boolean).join(' ');
      assert.match(detail, new RegExp(reason));
    };
    const event = (receipt, name, args) => {
      // [LAB] Listening to decoded on-chain events, including indexed rental/participant fields.
      const parsed = receipt.logs.map(log => { try { return loop.interface.parseLog(log); } catch { return null; } })
        .find(log => log?.name === name);
      assert.ok(parsed, `Missing ${name}`);
      assert.deepEqual([...parsed.args], args);
    };
    const jump = async timestamp => {
      await chain.request({ method: 'evm_setTime', params: [Number(timestamp) * 1000] });
      await chain.request({ method: 'evm_mine', params: [] });
    };
    const tooEarly = async (id, deadline) => {
      await assert.rejects(lx.claimTimeout.staticCall(id), error => {
        assert.equal(error.revert?.name, 'TooEarly');
        assert.deepEqual([...error.revert.args], [deadline]);
        return true;
      });
    };
    const request = async () => {
      await send(ll['listItem(string,uint256,uint256,uint256,uint256)']('Camera', 100, 1001, 100, 7));
      const item = await loop.itemCount();
      const [, , total] = await loop.requiredPayment(item, 1, b);
      await send(lb.requestRental(item, 1, { value: total }));
      return loop.rentalCount();
    };
    const active = async () => {
      const id = await request();
      await send(ll.approveRental(id));
      await send(lb.confirmHandover(id));
      return id;
    };
    const returned = async (late = 0n) => {
      const id = await active();
      const r = await loop.getRental(id);
      await jump(r.dueAt + late);
      await send(lb.markReturned(id));
      return id;
    };
    const balances = async () => [await loop.pendingBalance(l), await loop.pendingBalance(b)];
    const credit = async (before, lenderCredit, borrowerCredit) => {
      assert.deepEqual(await balances(), [before[0] + lenderCredit, before[1] + borrowerCredit]);
    };
    const unavailable = async id => {
      const item = (await loop.getRental(id)).itemId;
      for (const value of [true, false]) await rejects(ll.setItemAvailability.staticCall(item, value), 'ongoing rental');
      assert.equal((await loop.getItem(item)).available, false);
    };
    for (const id of [0, 999]) {
      await rejects(loop.getRental(id), 'Rental does not exist');
      await rejects(loop.claimTimeout.staticCall(id), 'Rental does not exist');
      await rejects(ll.setItemAvailability.staticCall(id, true), 'Item does not exist');
    }
    assert.deepEqual([...await loop.getUserRentals(x)], []);
    const first = await request();
    let r = await loop.getRental(first);
    assert.deepEqual([...r], [...await loop.rentals(first)]);
    await rejects(lx.setItemAvailability.staticCall(r.itemId, true), 'Only lender');
    await unavailable(first);
    await rejects(lb.rejectRental.staticCall(first), 'Only lender');
    await rejects(ll.cancelRental.staticCall(first), 'Only borrower');
    await rejects(lx.cancelRental.staticCall(first), 'Only borrower');
    await rejects(lb.rateUser.staticCall(first, 5), 'not completed or resolved');
    await rejects(loop.resolveDispute.staticCall(first, 50), 'InvalidStatus');
    await rejects(ll.raiseDispute.staticCall(first, 'Damage'), 'InvalidStatus');
    await rejects(lx.claimTimeout.staticCall(first), 'InvalidStatus');
    let before = await balances();
    event(await send(ll.rejectRental(first)), 'RentalCancelled', [first, l]);
    await credit(before, 0n, r.rent + r.deposit);
    assert.equal((await loop.getRental(first)).status, 7n);
    assert.equal((await loop.getItem(r.itemId)).available, true);
    await rejects(ll.rejectRental.staticCall(first), 'InvalidStatus');
    await rejects(lb.cancelRental.staticCall(first), 'Cannot cancel now');
    await rejects(lb.rateUser.staticCall(first, 5), 'not completed or resolved');
    // Pausing a free item can be undone without confusing it with a rental lock.
    event(await send(ll.setItemAvailability(r.itemId, false)), 'ItemAvailabilityChanged', [r.itemId, false]);
    await rejects(lb.requestRental.staticCall(r.itemId, 1, { value: 1101 }), 'not available');
    event(await send(ll.setItemAvailability(r.itemId, true)), 'ItemAvailabilityChanged', [r.itemId, true]);
    for (const approved of [false, true]) {
      const id = await request();
      if (approved) await send(ll.approveRental(id));
      await unavailable(id);
      r = await loop.getRental(id);
      before = await balances();
      event(await send(lb.cancelRental(id)), 'RentalCancelled', [id, b]);
      await credit(before, 0n, r.rent + r.deposit);
      assert.equal((await loop.getItem(r.itemId)).available, true);
      await rejects(lb.confirmHandover.staticCall(id), 'InvalidStatus');
    }
    assert.deepEqual([...await rep.getProfile(b)], [0n, 0n, 0n, 0n, 0n]);
    console.log('PASS: rejection and both cancellation states refund exactly once; listing pause/resume and getters');

    // Silent-lender timeout, with an on-time return and then a late return.
    for (const late of [0n, 61n]) {
      const id = await returned(late);
      r = await loop.getRental(id);
      const fee = late ? 200n : 0n;
      const deadline = r.returnedAt + 120n;
      await unavailable(id);
      await rejects(lb.cancelRental.staticCall(id), 'Cannot cancel now');
      await rejects(lb.raiseDispute.staticCall(id, 'Damage'), 'Only lender');
      await jump(deadline - 1n);
      await tooEarly(id, deadline);
      assert.equal((await loop.getRental(id)).status, 3n);
      await jump(deadline);
      await rejects(ll.raiseDispute.staticCall(id, 'Too late'), 'window closed');
      before = await balances();
      event(await send(lx.claimTimeout(id)), 'RentalSettled', [id, r.rent + fee, r.deposit - fee, fee]);
      await credit(before, r.rent + fee, r.deposit - fee);
      assert.equal((await loop.getRental(id)).status, 4n);
      assert.equal((await loop.getItem(r.itemId)).available, true);
      await rejects(lx.claimTimeout.staticCall(id), 'InvalidStatus');
      await rejects(ll.confirmReturn.staticCall(id), 'InvalidStatus');
    }
    assert.deepEqual([...(await rep.getProfile(b))].slice(0, 2), [1n, 1n]);
    console.log('PASS: permissionless return timeouts at exact boundary; TooEarly deadline; timestamp-based fees and reputation');

    const defaulted = await active();
    r = await loop.getRental(defaulted);
    await unavailable(defaulted);
    await rejects(ll.confirmReturn.staticCall(defaulted), 'InvalidStatus'); // T8: Active, before any return claim.
    await rejects(lb.rateUser.staticCall(defaulted, 5), 'not completed or resolved');
    await rejects(lb.cancelRental.staticCall(defaulted), 'Cannot cancel now');
    await rejects(ll.rejectRental.staticCall(defaulted), 'InvalidStatus');
    const deadline = r.dueAt + 180n;
    await jump(deadline - 1n);
    await tooEarly(defaulted, deadline);
    await jump(deadline);
    before = await balances();
    const profileBefore = [...await rep.getProfile(b)];
    event(await send(lx.claimTimeout(defaulted)), 'RentalDefaulted', [defaulted]);
    await credit(before, r.rent + r.deposit, 0n);
    assert.equal((await loop.getRental(defaulted)).status, 8n);
    assert.equal((await loop.getItem(r.itemId)).available, false);
    assert.deepEqual([...await rep.getProfile(b)], profileBefore);
    await rejects(lb.rateUser.staticCall(defaulted, 5), 'not completed or resolved');
    await rejects(lb.markReturned.staticCall(defaulted), 'InvalidStatus');
    await rejects(lx.claimTimeout.staticCall(defaulted), 'InvalidStatus');
    // Only the lender can relist after recovering the physical item.
    await send(ll.setItemAvailability(r.itemId, true));
    assert.equal((await loop.getItem(r.itemId)).available, true);
    console.log('PASS: default boundary, full lender payout once, unavailable until lender relists');

    // Disputes freeze timeout settlement. Test 0%, rounding at 50%, and 100% of actual discounted deposit.
    let resolved;
    for (const pct of [0n, 50n, 100n]) {
      const id = await returned();
      resolved = id;
      r = await loop.getRental(id);
      await jump(r.returnedAt + 119n);
      event(await send(ll.raiseDispute(id, 'Screen cracked')), 'DisputeRaised', [id, 'Screen cracked']);
      assert.equal((await loop.getRental(id)).status, 5n);
      await unavailable(id);
      await rejects(lb.rateUser.staticCall(id, 5), 'not completed or resolved');
      await rejects(lb.resolveDispute.staticCall(id, pct), 'caller is not the owner');
      await rejects(loop.resolveDispute.staticCall(id, 101), 'Share must be');
      await jump(r.returnedAt + 600n);
      await rejects(lx.claimTimeout.staticCall(id), 'InvalidStatus');
      await rejects(ll.confirmReturn.staticCall(id), 'InvalidStatus');
      await rejects(ll.raiseDispute.staticCall(id, 'Again'), 'InvalidStatus');
      const depositShare = r.deposit * pct / 100n;
      before = await balances();
      event(await send(loop.resolveDispute(id, pct)), 'DisputeResolved', [id, r.rent + depositShare, r.deposit - depositShare]);
      await credit(before, r.rent + depositShare, r.deposit - depositShare);
      assert.equal((await loop.getRental(id)).status, 6n);
      assert.equal((await loop.getItem(r.itemId)).available, true);
      await rejects(loop.resolveDispute.staticCall(id, pct), 'InvalidStatus');
    }
    assert.deepEqual([...await rep.getProfile(b)], profileBefore, 'Disputes do not count as normal completions');
    console.log('PASS: authorized disputes within window, frozen escrow, admin splits 0/50/100 with rounding and conservation');

    const completed = 4n;
    for (const id of [completed, resolved]) {
      await rejects(lx.rateUser.staticCall(id, 5), 'Only rental participants');
      for (const stars of [0, 6, 255]) await rejects(lb.rateUser.staticCall(id, stars), 'stars must be 1 to 5');
      assert.equal(await rep.hasRated(id, b), false);
      event(await send(lb.rateUser(id, 5)), 'UserRated', [id, b, l, 5n]);
      await rejects(lb.rateUser.staticCall(id, 4), 'already rated');
      event(await send(ll.rateUser(id, 4)), 'UserRated', [id, l, b, 4n]);
      await rejects(ll.rateUser.staticCall(id, 3), 'already rated');
    }
    assert.equal(await rep.averageRating(l), 500n);
    assert.equal(await rep.averageRating(b), 400n);
    assert.equal((await rep.getProfile(l)).ratingCount, 2n);
    assert.equal((await rep.getProfile(b)).ratingCount, 2n);
    // Removal must not prevent existing participants rating or withdrawing.
    await send(loop.removeStudent(b));
    await send(lb.rateUser(5, 3));
    const expectedIds = Array.from({ length: Number(await loop.rentalCount()) }, (_, i) => BigInt(i + 1));
    assert.deepEqual([...await loop.getUserRentals(l)], expectedIds);
    assert.deepEqual([...await loop.getUserRentals(b)], expectedIds);
    assert.deepEqual([...await loop.getUserRentals(a)], []);
    console.log('PASS: Completed/Resolved participant ratings, both directions, bounds, duplicates, averages, removed participant access');

    before = await balances();
    for (const value of [0n, 1n]) {
      await rejects(outsider.call({ to: address, value }), 'Use requestRental');
      await rejects(outsider.call({ to: address, data: '0x1234', value }), 'Function does not exist');
    }
    // Mine actual reverted payment transactions, rather than relying only on simulation.
    for (const data of ['0x', '0x1234']) {
      const tx = await outsider.sendTransaction({ to: address, data, value: 1, gasLimit: 100000 });
      await assert.rejects(tx.wait(), /revert/);
    }
    assert.deepEqual(await balances(), before);
    assert.equal(await loop.contractBalance(), before[0] + before[1]);
    for (const signer of [lender, borrower]) {
      const who = await signer.getAddress();
      const amount = await loop.pendingBalance(who);
      const walletBefore = BigInt(await chain.request({ method: 'eth_getBalance', params: [who, 'latest'] }));
      const receipt = await send(loop.connect(signer).withdraw());
      event(receipt, 'Withdrawn', [who, amount]);
      const walletAfter = BigInt(await chain.request({ method: 'eth_getBalance', params: [who, 'latest'] }));
      assert.equal(walletAfter + receipt.fee - walletBefore, amount);
      assert.equal(await loop.pendingBalance(who), 0n);
      await rejects(loop.connect(signer).withdraw.staticCall(), 'Nothing to withdraw');
    }
    assert.equal(await loop.contractBalance(), 0n);
    console.log('PASS: receive/fallback reject with/without value; all Phase 4 credits withdraw; escrow ends at zero (T21)');
    console.log('Phase 4 verification complete.');
  } finally {
    await chain.disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
