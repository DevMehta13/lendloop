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
  sources['TestHelpers.sol'] = { content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "contracts/LendLoop.sol";
contract BrokenReputation {
    function discountPercent(address) external pure returns (uint256) { return 0; }
    function recordCompletion(address, address, bool) external pure { revert("Offline"); }
}
contract Receiver {
    LendLoop public loop;
    bool public rejectPayment;
    bool public attack;
    bool public reentrySucceeded;
    constructor(LendLoop target) { loop = target; }
    function list() external { loop.listItem("Receiver item", 100, 1000); }
    function approve(uint256 id) external { loop.approveRental(id); }
    function settle(uint256 id) external { loop.confirmReturn(id); }
    function withdraw(bool reject, bool reenter) external {
        rejectPayment = reject;
        attack = reenter;
        loop.withdraw();
    }
    receive() external payable {
        require(!rejectPayment, "Reject payment");
        if (attack) {
            (bool ok, ) = address(loop).call(abi.encodeWithSignature("withdraw()"));
            reentrySucceeded = ok;
        }
    }
}` };
  const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources,
    settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } } } })));
  assert.match(solc.version(), /^0\.8\.24\+/);
  assert.deepEqual(output.errors || [], [], 'All sources compile without errors or warnings');
  const size = output.contracts['contracts/LendLoop.sol'].LendLoop.evm.deployedBytecode.object.length / 2;
  assert.ok(size < 24576, 'Runtime fits EIP-170 contract size limit');
  console.log(`PASS: Solidity ${solc.version()}, zero warnings/errors; LendLoop runtime ${size} bytes`);

  const chain = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 6 },
    miner: { timestampIncrement: 0 } });
  try {
    const provider = new ethers.BrowserProvider(chain);
    provider.pollingInterval = 10;
    const [admin, lender, borrower, other, outsider] = await Promise.all(
      Array.from({ length: 5 }, (_, i) => provider.getSigner(i)));
    const [a, l, b, o, x] = await Promise.all([admin, lender, borrower, other, outsider].map(s => s.getAddress()));
    const send = async tx => (await tx).wait();
    const deploy = async (file, name, args = []) => {
      const artifact = output.contracts[file][name];
      const contract = await new ethers.ContractFactory(artifact.abi, artifact.evm.bytecode.object, admin).deploy(...args);
      await contract.waitForDeployment();
      return contract;
    };
    const rep = await deploy('contracts/Reputation.sol', 'Reputation');
    const loop = await deploy('contracts/LendLoop.sol', 'LendLoop', [await rep.getAddress(), 60]);
    const address = await loop.getAddress();
    await send(rep.setLendLoop(address));
    const ll = loop.connect(lender), lb = loop.connect(borrower);
    const full = 'listItem(string,uint256,uint256,uint256,uint256)';
    const short = 'listItem(string,uint256,uint256)';
    const rejects = async (call, reason) => {
      let failure;
      try { await call; } catch (error) { failure = error; }
      assert.ok(failure, `Expected rejection: ${reason}`);
      const detail = [failure.reason, failure.shortMessage, failure.info?.error?.message,
        failure.info?.error?.data?.reason, failure.message].filter(Boolean).join(' ');
      assert.ok(new RegExp(reason).test(detail), `Expected rejection reason: ${reason}`);
    };
    const event = (receipt, name, args) => {
      const parsed = receipt.logs.map(log => { try { return loop.interface.parseLog(log); } catch { return null; } })
        .find(log => log?.name === name);
      assert.ok(parsed, `Missing ${name}`);
      if (args) assert.deepEqual([...parsed.args], args);
      return parsed;
    };
    const jump = async timestamp => {
      await chain.request({ method: 'evm_setTime', params: [Number(timestamp) * 1000] });
      await chain.request({ method: 'evm_mine', params: [] });
    };
    const quote = (id, units = 1) => loop.requiredPayment(id, units, b);
    const list = async (rent = 100n, deposit = 1000n, fee = 100n) => {
      await send(ll[full]('Calculator', rent, deposit, fee, 7));
      return loop.itemCount();
    };
    const request = async (item, units = 1) => {
      const [rent, deposit, total] = await quote(item, units);
      const receipt = await send(lb.requestRental(item, units, { value: total }));
      const id = await loop.rentalCount();
      event(receipt, 'RentalRequested', [id, BigInt(item), b, total]);
      const r = await loop.rentals(id);
      assert.deepEqual([r.rent, r.deposit, r.status], [rent, deposit, 0n]);
      assert.equal((await loop.getItem(item)).available, false);
      return id;
    };
    const active = async (item, units = 1) => {
      const id = await request(item, units);
      event(await send(ll.approveRental(id)), 'RentalApproved', [id]);
      const receipt = await send(lb.confirmHandover(id));
      const r = await loop.rentals(id);
      const block = await provider.getBlock(receipt.blockNumber);
      assert.equal(r.dueAt, BigInt(block.timestamp) + BigInt(units) * 60n);
      assert.equal(r.status, 2n);
      event(receipt, 'HandoverConfirmed', [id, r.dueAt]);
      return id;
    };
    const settle = async (id, returnAt, expectedFee) => {
      const before = await loop.rentals(id);
      await jump(returnAt);
      event(await send(lb.markReturned(id)), 'ReturnMarked', [id, returnAt]);
      assert.equal((await loop.rentals(id)).status, 3n);
      const lenderPending = await loop.pendingBalance(l);
      const borrowerPending = await loop.pendingBalance(b);
      // Confirmation can be much later; only the recorded return time determines the fee.
      await jump(returnAt + 600n);
      event(await send(ll.confirmReturn(id)), 'RentalSettled',
        [id, before.rent + expectedFee, before.deposit - expectedFee, expectedFee]);
      assert.equal((await loop.rentals(id)).status, 4n);
      assert.equal((await loop.getItem(before.itemId)).available, true);
      assert.equal(await loop.pendingBalance(l), lenderPending + before.rent + expectedFee);
      assert.equal(await loop.pendingBalance(b), borrowerPending + before.deposit - expectedFee);
      await rejects(ll.confirmReturn.staticCall(id), 'InvalidStatus');
    };
    const drain = async () => {
      for (const signer of [lender, borrower]) {
        const who = await signer.getAddress();
        const amount = await loop.pendingBalance(who);
        if (!amount) continue;
        const before = BigInt(await chain.request({ method: 'eth_getBalance', params: [who, 'latest'] }));
        const receipt = await send(loop.connect(signer).withdraw());
        const after = BigInt(await chain.request({ method: 'eth_getBalance', params: [who, 'latest'] }));
        assert.equal(after + receipt.fee - before, amount, 'Wallet receives exact credit less gas');
        event(receipt, 'Withdrawn', [who, amount]);
        assert.equal(await loop.pendingBalance(who), 0n);
      }
      assert.equal(await loop.contractBalance(), 0n);
    };

    const art = output.contracts['contracts/LendLoop.sol'].LendLoop;
    const factory = new ethers.ContractFactory(art.abi, art.evm.bytecode.object, admin);
    await rejects(factory.deploy(ethers.ZeroAddress, 60), 'Reputation address required');
    await rejects(factory.deploy(await rep.getAddress(), 0), 'Time unit must be > 0');
    assert.equal(await loop.owner(), a);
    assert.equal(await loop.contractName(), 'LendLoop');
    assert.equal(await loop.timeUnit(), 60n);
    assert.equal(await loop.reputation(), await rep.getAddress());
    assert.equal(await loop.CONFIRM_WINDOW_UNITS(), 2n);
    assert.equal(await loop.DEFAULT_AFTER_UNITS(), 3n);
    await rejects(ll.registerStudent.staticCall(b), 'caller is not the owner');
    await rejects(ll.removeStudent.staticCall(b), 'caller is not the owner');
    await rejects(loop.registerStudent.staticCall(ethers.ZeroAddress), 'Student address required');
    await rejects(ll[short].staticCall('Item', 100, 1000), 'NotAStudent');
    for (const who of [l, b, o]) event(await send(loop.registerStudent(who)), 'StudentRegistered', [who]);
    event(await send(loop.removeStudent(o)), 'StudentRemoved', [o]);
    assert.equal(await loop.isStudent(o), false);
    await rejects(loop.connect(other)[short].staticCall('Item', 100, 1000), 'NotAStudent');
    await rejects(ll[full].staticCall('Item', 100, 0, 10, 7), 'Deposit must be > 0');
    await rejects(ll[full].staticCall('Item', 100, 1000, 10, 0), 'Max units must be > 0');
    event(await send(ll[short]('Camera', 100, 1000)), 'ItemListed', [1n, l, 'Camera', 100n, 1000n]);
    assert.deepEqual([...(await loop.getItem(1))], [1n, l, 'Camera', 100n, 1000n, 100n, 7n, true]);
    for (const invalid of [0, 99]) {
      await rejects(loop.getItem(invalid), 'Item does not exist');
      await rejects(quote(invalid), 'Item does not exist');
      await rejects(lb.requestRental.staticCall(invalid, 1), 'Item does not exist');
    }
    for (const units of [0, 8]) await rejects(quote(1, units), 'Invalid rental units');
    assert.deepEqual([...(await quote(1, 2))], [200n, 1000n, 1200n]);
    await rejects(loop.connect(outsider).requestRental.staticCall(1, 1, { value: 1100 }), 'NotAStudent');
    await rejects(ll.requestRental.staticCall(1, 1, { value: 1100 }), 'Cannot rent own item');
    for (const value of [1099, 1101]) await rejects(lb.requestRental.staticCall(1, 1, { value }), 'Send exact rent');
    assert.equal(await loop.rentalCount(), 0n);
    assert.equal((await loop.getItem(1)).available, true);
    console.log('PASS: constructor, registration, removal, both listings, quotes, invalid IDs/units, permissions and exact payments');

    const first = await request(1, 2);
    await rejects(lb.requestRental.staticCall(1, 1, { value: 1100 }), 'Item not available');
    await rejects(lb.approveRental.staticCall(first), 'Only lender');
    await rejects(ll.confirmHandover.staticCall(first), 'Only borrower');
    await rejects(lb.confirmHandover.staticCall(first), 'InvalidStatus');
    await rejects(lb.markReturned.staticCall(first), 'InvalidStatus');
    await rejects(ll.confirmReturn.staticCall(first), 'InvalidStatus');
    await send(ll.approveRental(first));
    await rejects(ll.approveRental.staticCall(first), 'InvalidStatus');
    await send(lb.confirmHandover(first));
    await rejects(ll.markReturned.staticCall(first), 'Only borrower');
    await rejects(lb.confirmHandover.staticCall(first), 'InvalidStatus');
    // Removing students blocks new business, but must never trap an existing rental's funds.
    await send(loop.removeStudent(b));
    const due = (await loop.rentals(first)).dueAt;
    await settle(first, due, 0n);
    assert.equal((await rep.getProfile(b)).onTimeReturns, 1n);
    assert.equal((await rep.getProfile(l)).lendsCompleted, 1n);
    assert.equal(await loop.contractBalance(), 1200n, 'Settlement credits funds without sending ETH');
    await drain();
    await rejects(lb.withdraw.staticCall(), 'Nothing to withdraw');
    await send(loop.registerStudent(b));
    console.log('PASS: full on-time rental, exact due-time boundary, role/state guards, delayed confirmation, removed-user exit and both wallet withdrawals');

    // Consecutive successful rentals exercise real Reputation discounts, not a stub.
    for (const [completed, pct] of [[1, 10], [2, 10], [3, 25], [4, 25], [5, 50]]) {
      const [, deposit] = await quote(1);
      assert.equal(deposit, 1000n - 1000n * BigInt(pct) / 100n);
      const id = await active(1);
      assert.equal((await loop.rentals(id)).deposit, deposit);
      await settle(id, (await loop.rentals(id)).dueAt - 1n, 0n);
      assert.equal((await rep.getProfile(b)).onTimeReturns, BigInt(completed + 1));
    }
    await drain();
    console.log('PASS: real completion records produce 10/25/50 percent discounted deposits; repeat rentals accumulate credits correctly');

    for (const [delay, fee] of [[1n, 100n], [60n, 100n], [61n, 200n], [600n, 500n]]) {
      const id = await active(1);
      await settle(id, (await loop.rentals(id)).dueAt + delay, fee);
    }
    // A genuinely late return with no monetary fee must still hurt reputation.
    const freeFeeItem = await list(0n, 9n, 0n);
    const zeroId = await active(freeFeeItem);
    const lateBefore = (await rep.getProfile(b)).lateReturns;
    await settle(zeroId, (await loop.rentals(zeroId)).dueAt + 1n, 0n);
    assert.equal((await rep.getProfile(b)).lateReturns, lateBefore + 1n);
    await drain();
    console.log('PASS: rounded-up lateness at 1/60/61 seconds, fee capped at discounted deposit, zero rent/fee, and timestamp-based late reputation');

    const broken = await deploy('TestHelpers.sol', 'BrokenReputation');
    const isolated = await deploy('contracts/LendLoop.sol', 'LendLoop', [await broken.getAddress(), 60]);
    for (const who of [l, b]) await send(isolated.registerStudent(who));
    await send(isolated.connect(lender)[short]('Offline reputation', 100, 1000));
    await send(isolated.connect(borrower).requestRental(1, 1, { value: 1100 }));
    await send(isolated.connect(lender).approveRental(1));
    await send(isolated.connect(borrower).confirmHandover(1));
    await send(isolated.connect(borrower).markReturned(1));
    const failedRepReceipt = await send(isolated.connect(lender).confirmReturn(1));
    event(failedRepReceipt, 'ReputationUpdateFailed', [1n]);
    assert.equal((await isolated.rentals(1)).status, 4n);
    assert.equal(await isolated.pendingBalance(l), 100n);
    assert.equal(await isolated.pendingBalance(b), 1000n);
    await send(isolated.connect(lender).withdraw());
    await send(isolated.connect(borrower).withdraw());
    assert.equal(await isolated.contractBalance(), 0n);
    console.log('PASS: reverting reputation emits failure event while settlement and both withdrawals succeed');

    const receiver = await deploy('TestHelpers.sol', 'Receiver', [address]);
    const receiverAddress = await receiver.getAddress();
    await send(loop.registerStudent(receiverAddress));
    await send(receiver.list());
    const receiverItem = await loop.itemCount();
    const receiverRental = await request(receiverItem);
    await send(receiver.approve(receiverRental));
    await send(lb.confirmHandover(receiverRental));
    await send(lb.markReturned(receiverRental));
    await send(receiver.settle(receiverRental));
    await rejects(receiver.withdraw.staticCall(true, false), 'Transfer failed');
    // Send a reverting transaction to verify EVM rollback, not just an eth_call simulation.
    await assert.rejects(send(receiver.withdraw(true, false, { gasLimit: 300000 })), /revert/);
    assert.equal(await loop.pendingBalance(receiverAddress), 100n);
    await send(lb.withdraw());
    assert.equal(await loop.contractBalance(), 100n);
    await send(receiver.withdraw(false, true));
    assert.equal(await receiver.reentrySucceeded(), false);
    assert.equal(await loop.pendingBalance(receiverAddress), 0n);
    assert.equal(await loop.contractBalance(), 0n);
    assert.equal(BigInt(await chain.request({ method: 'eth_getBalance', params: [receiverAddress, 'latest'] })), 100n);
    assert.equal(await loop.pendingBalance(x), 0n);
    console.log('PASS: rejecting receiver retains credit, other participant can withdraw, reentry fails, retry pays once, final escrow is zero');
    console.log('Phase 3 verification complete.');
  } finally {
    await chain.disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
