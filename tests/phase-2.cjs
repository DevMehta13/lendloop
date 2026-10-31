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
  const output = JSON.parse(solc.compile(JSON.stringify({
    language: 'Solidity', sources,
    settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } }
  })));
  assert.match(solc.version(), /^0\.8\.24\+/);
  assert.deepEqual(output.errors || [], [], 'Compile without warnings or errors');
  console.log(`PASS: all contracts compile with ${solc.version()}, no warnings or errors`);
  const artifact = output.contracts['contracts/Reputation.sol'].Reputation;
  const chain = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 6 } });
  try {
    const provider = new ethers.BrowserProvider(chain);
    provider.pollingInterval = 10;
    const signers = await Promise.all(Array.from({ length: 6 }, (_, i) => provider.getSigner(i)));
    const [owner, writer, outsider, borrower, lender, secondRater] = signers;
    const [ownerAddress, writerAddress, outsiderAddress, borrowerAddress, lenderAddress, secondRaterAddress] =
      await Promise.all(signers.map(signer => signer.getAddress()));
    const deploy = async () => {
      const contract = await new ethers.ContractFactory(artifact.abi, artifact.evm.bytecode.object, owner).deploy();
      await contract.waitForDeployment();
      return contract;
    };
    const contract = await deploy();
    const profile = async user => [...await contract.getProfile(user)];
    const rejects = (call, reason) => assert.rejects(call, new RegExp(reason));
    const send = async tx => (await tx).wait();
    const event = (receipt, name, args) => {
      const parsed = receipt.logs.map(log => contract.interface.parseLog(log)).find(log => log.name === name);
      assert.ok(parsed, `Missing ${name}`);
      assert.deepEqual([...parsed.args], args);
    };

    assert.equal(await contract.owner(), ownerAddress);
    assert.equal(await contract.contractName(), 'Reputation');
    assert.equal(await contract.lendLoop(), ethers.ZeroAddress);
    assert.deepEqual(await profile(borrowerAddress), [0n, 0n, 0n, 0n, 0n]);
    assert.equal(await contract.averageRating(borrowerAddress), 0n);
    assert.equal(await contract.discountPercent(borrowerAddress), 0n);
    await rejects(contract.recordCompletion.staticCall(borrowerAddress, lenderAddress, false), 'caller is not LendLoop');
    await rejects(contract.connect(outsider).setLendLoop.staticCall(writerAddress), 'caller is not the owner');
    await rejects(contract.setLendLoop.staticCall(ethers.ZeroAddress), 'zero address');
    assert.equal(await contract.lendLoop(), ethers.ZeroAddress);
    event(await send(contract.setLendLoop(writerAddress)), 'LendLoopSet', [writerAddress]);
    assert.equal(await contract.lendLoop(), writerAddress);
    await rejects(contract.setLendLoop.staticCall(outsiderAddress), 'LendLoop already set');
    const writable = contract.connect(writer);
    await rejects(contract.connect(outsider).recordCompletion.staticCall(borrowerAddress, lenderAddress, false), 'caller is not LendLoop');
    await rejects(contract.recordRating.staticCall(1, lenderAddress, borrowerAddress, 5), 'caller is not LendLoop');
    assert.deepEqual(await profile(borrowerAddress), [0n, 0n, 0n, 0n, 0n]);
    console.log('PASS: deployment, empty profile, owner-only nonzero one-time configuration, and write restrictions');

    const tiers = [0n, 10n, 10n, 25n, 25n, 50n, 50n];
    for (let count = 1; count <= 6; count++) {
      event(await send(writable.recordCompletion(borrowerAddress, lenderAddress, false)),
        'CompletionRecorded', [borrowerAddress, lenderAddress, false]);
      assert.deepEqual(await profile(borrowerAddress), [BigInt(count), 0n, 0n, 0n, 0n]);
      assert.deepEqual(await profile(lenderAddress), [0n, 0n, BigInt(count), 0n, 0n]);
      assert.equal(await contract.discountPercent(borrowerAddress), tiers[count]);
      assert.equal(await contract.discountPercent(lenderAddress), 0n);
    }
    for (let late = 1; late <= 7; late++) {
      event(await send(writable.recordCompletion(borrowerAddress, lenderAddress, true)),
        'CompletionRecorded', [borrowerAddress, lenderAddress, true]);
      assert.equal(await contract.discountPercent(borrowerAddress), late > 6 ? 0n : 50n);
    }
    assert.deepEqual(await profile(borrowerAddress), [6n, 7n, 0n, 0n, 0n]);
    assert.deepEqual(await profile(lenderAddress), [0n, 0n, 13n, 0n, 0n]);
    await send(writable.recordCompletion(borrowerAddress, lenderAddress, false));
    assert.equal(await contract.discountPercent(borrowerAddress), 50n);
    await send(writable.recordCompletion(outsiderAddress, lenderAddress, true));
    assert.equal(await contract.discountPercent(outsiderAddress), 0n);
    console.log('PASS: discount boundaries 0–6, independent borrower/lender counters, late-majority penalty and recovery');

    for (const stars of [0, 6, 255]) {
      await rejects(writable.recordRating.staticCall(1, lenderAddress, borrowerAddress, stars), 'stars must be 1 to 5');
    }
    assert.equal(await contract.hasRated(1, lenderAddress), false);
    event(await send(writable.recordRating(1, lenderAddress, borrowerAddress, 5)),
      'RatingRecorded', [1n, borrowerAddress, 5n]);
    assert.equal(await contract.hasRated(1, lenderAddress), true);
    assert.equal(await contract.averageRating(borrowerAddress), 500n);
    await rejects(writable.recordRating.staticCall(1, lenderAddress, borrowerAddress, 4), 'already rated');
    await rejects(writable.recordRating.staticCall(1, lenderAddress, outsiderAddress, 4), 'already rated');
    await send(writable.recordRating(2, lenderAddress, borrowerAddress, 4));
    assert.equal(await contract.averageRating(borrowerAddress), 450n);
    await send(writable.recordRating(2, secondRaterAddress, borrowerAddress, 1));
    assert.equal(await contract.averageRating(borrowerAddress), 333n);
    assert.deepEqual(await profile(borrowerAddress), [7n, 7n, 0n, 10n, 3n]);
    await send(writable.recordRating(1, borrowerAddress, lenderAddress, 4));
    assert.equal(await contract.averageRating(lenderAddress), 400n);
    assert.equal(await contract.hasRated(1, borrowerAddress), true);
    assert.equal(await contract.hasRated(2, outsiderAddress), false);
    assert.equal(await contract.discountPercent(borrowerAddress), 50n);
    assert.deepEqual(await profile(secondRaterAddress), [0n, 0n, 0n, 0n, 0n]);
    console.log('PASS: ratings 1–5, duplicate rejection, per-rental/per-rater keys, two-way ratings, average scaling and truncation');

    const fresh = await deploy();
    await send(fresh.transferOwnership(outsiderAddress));
    await rejects(fresh.setLendLoop.staticCall(writerAddress), 'caller is not the owner');
    await send(fresh.connect(outsider).setLendLoop(writerAddress));
    await send(contract.transferOwnership(outsiderAddress));
    await rejects(contract.connect(outsider).setLendLoop.staticCall(outsiderAddress), 'LendLoop already set');
    await send(writable.recordCompletion(secondRaterAddress, lenderAddress, false));
    assert.equal(await contract.discountPercent(secondRaterAddress), 10n);
    await rejects(contract.connect(outsider).recordCompletion.staticCall(borrowerAddress, lenderAddress, false), 'caller is not LendLoop');
    console.log('PASS: ownership transfer changes configuration authority without replacing the configured writer');
    console.log('Phase 2 verification complete.');
  } finally {
    await chain.disconnect();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
