function createDemo(artifacts) {
  const provider = new ethers.providers.Web3Provider(web3Provider);
  const E = ethers.utils.parseEther;
  const full = 'listItem(string,uint256,uint256,uint256,uint256)';
  const short = 'listItem(string,uint256,uint256)';
  let signers, addresses, rep, loop, started, next = 1;
  const eq = (actual, expected) => { if (String(actual) !== String(expected)) throw Error('Expected '+expected+', got '+actual); };
  const tx = async promise => {
    const receipt = await (await promise).wait();
    for (const log of receipt.logs) {
      for (const contract of [loop, rep].filter(Boolean)) {
        try { const event = contract.interface.parseLog(log); console.log(event.name, event.args.map(String).join(', ')); break; } catch (_) {}
      }
    }
    return receipt;
  };
  const reject = async (call, reason) => {
    let error;
    try {
      const result = await call();
      // Some Remix VM providers return ABI revert data from eth_call instead of throwing.
      if (typeof result === 'string' && result.startsWith('0x08c379a0')) {
        const [message] = ethers.utils.defaultAbiCoder.decode(['string'], '0x'+result.slice(10));
        if (message !== reason) throw Error('Unexpected revert: '+message);
        console.log('EXPECTED REVERT:', message); return;
      }
    } catch (e) { error = e; }
    if (!error) throw Error('Expected rejection: '+reason);
    const detail = JSON.stringify(error, Object.getOwnPropertyNames(error));
    const encoded = reason === 'NotAStudent' || reason === 'TooEarly' ? loop.interface.getSighash(reason) : ethers.utils.hexlify(ethers.utils.toUtf8Bytes(reason)).slice(2);
    if (!detail.includes(reason) && !detail.toLowerCase().includes(encoded.toLowerCase())) throw error;
    console.log('EXPECTED REVERT:', reason);
  };
  const quote = (item, who) => loop.requiredPayment(item,1,addresses[who]);
  const activate = async (id, item, who) => {
    const q = await quote(item,who);
    await tx(loop.connect(signers[who]).requestRental(item,1,{value:q.total}));
    await tx(loop.connect(signers[1]).approveRental(id));
    await tx(loop.connect(signers[who]).confirmHandover(id));
  };
  const waitUntil = async timestamp => {
    // Real wall-clock wait: no EVM time travel during the Remix rehearsal.
    while (Math.floor(Date.now()/1000) <= Number(timestamp)) await new Promise(r => setTimeout(r,1000));
  };
  return { async step(n) {
    if (n !== next) throw Error('Run step '+next+' next');
    console.log('=== PHASE 5 / STEP '+n+' ===');
    if (n === 1) {
      started = Date.now();
      addresses = (await provider.listAccounts()).slice(0,5);
      if (addresses.length < 5) throw Error('Choose a fresh Remix VM with at least five accounts');
      signers = addresses.map(a => provider.getSigner(a));
      const deploy = async (name,args=[]) => {
        const c = await new ethers.ContractFactory(artifacts[name].abi,artifacts[name].bytecode,signers[0]).deploy(...args);
        await c.deployed(); return c;
      };
      rep = await deploy('Reputation'); loop = await deploy('LendLoop',[rep.address,60]);
      await tx(rep.setLendLoop(loop.address));
      eq(await loop.owner(),addresses[0]); eq(await loop.timeUnit(),60); eq(await loop.contractName(),'LendLoop');
      console.log('Fresh deployment',rep.address,loop.address,'timeUnit=60');
      await reject(()=>provider.call({from:addresses[0],to:loop.address,value:E('1'),data:'0x'}),'Use requestRental');
      await reject(()=>provider.call({from:addresses[0],to:loop.address,value:E('1'),data:'0x1234'}),'Function does not exist');
    }
    if (n === 2) for (const a of addresses.slice(1,4)) await tx(loop.registerStudent(a));
    if (n === 3) await reject(()=>loop.connect(signers[4]).callStatic[short]('Outsider',E('0.01'),E('1')),'NotAStudent');
    if (n === 4) await tx(loop.connect(signers[1])[full]('Casio fx-991EX',E('0.01'),E('1'),E('0.1'),3));
    if (n === 5) { await tx(loop.connect(signers[1])[short]('Drafter',E('0.01'),E('0.5'))); eq((await loop.getItem(2)).lateFeePerUnit,E('0.05')); }
    if (n === 6) {
      const q=await quote(1,2); eq(q.total,E('1.01'));
      await reject(()=>loop.connect(signers[2]).callStatic.requestRental(1,1,{value:1}),'Send exact rent + deposit');
      await tx(loop.connect(signers[2]).requestRental(1,1,{value:q.total})); eq(await loop.contractBalance(),E('1.01'));
    }
    if (n === 7) {
      await tx(loop.connect(signers[1]).approveRental(1)); eq((await loop.getRental(1)).status,1);
      await tx(loop.connect(signers[2]).confirmHandover(1)); eq((await loop.getRental(1)).status,2);
      console.log('Aman dueAt',String((await loop.getRental(1)).dueAt));
    }
    if (n === 8) {
      await activate(2,2,3); await tx(loop.connect(signers[3]).markReturned(2)); await tx(loop.connect(signers[1]).confirmReturn(2));
      eq(await loop.pendingBalance(addresses[3]),E('0.5')); eq((await rep.getProfile(addresses[3])).onTimeReturns,1);
    }
    if (n === 9) {
      await tx(loop.connect(signers[3]).rateUser(2,5)); await tx(loop.connect(signers[1]).rateUser(2,4));
      eq(await rep.averageRating(addresses[1]),500); eq(await rep.averageRating(addresses[3]),400);
      console.log('Ratings: Riya=5.00, Neha=4.00');
    }
    if (n === 10) {
      eq((await quote(1,3)).total,E('0.91')); eq((await quote(1,2)).total,E('1.01'));
      console.log('Neha quote=0.91 ETH; Aman quote=1.01 ETH; discount=10%');
    }
    if (n === 11) {
      const r=await loop.getRental(1); console.log('Waiting for two real minutes after handover...'); await waitUntil(Number(r.dueAt)+60);
      await tx(loop.connect(signers[2]).markReturned(1)); const returned=await loop.getRental(1);
      const units=returned.returnedAt.sub(r.dueAt).add(59).div(60); const fee=units.mul(E('0.1')); const capped=fee.gt(r.deposit)?r.deposit:fee;
      await tx(loop.connect(signers[1]).confirmReturn(1)); eq(await loop.pendingBalance(addresses[2]),r.deposit.sub(capped));
      if (capped.isZero()) throw Error('Late fee must be positive');
      console.log('Late fee',ethers.utils.formatEther(capped),'ETH');
    }
    if (n === 12) {
      await activate(3,1,3); eq((await loop.getRental(3)).deposit,E('0.9'));
      await tx(loop.connect(signers[3]).markReturned(3)); await tx(loop.connect(signers[1]).raiseDispute(3,'Screen cracked'));
      const before=await loop.pendingBalance(addresses[3]); await tx(loop.resolveDispute(3,50));
      eq((await loop.getRental(3)).status,6); eq((await loop.pendingBalance(addresses[3])).sub(before),E('0.45'));
    }
    if (n === 13) {
      await activate(4,2,2); await tx(loop.connect(signers[2]).markReturned(4));
      await reject(()=>loop.connect(signers[2]).callStatic.claimTimeout(4),'TooEarly');
      const r=await loop.getRental(4); console.log('Waiting for real 120-second confirmation window...'); await waitUntil(Number(r.returnedAt)+120);
      await tx(loop.connect(signers[2]).claimTimeout(4)); eq((await loop.getRental(4)).status,4);
    }
    if (n === 14) {
      console.log('Lender credit ETH',ethers.utils.formatEther(await loop.pendingBalance(addresses[1])));
      await tx(loop.connect(signers[1]).withdraw()); eq(await loop.pendingBalance(addresses[1]),0);
      await reject(()=>loop.connect(signers[1]).callStatic.withdraw(),'Nothing to withdraw');
    }
    if (n === 15) {
      await reject(()=>provider.call({from:addresses[0],to:loop.address,value:E('1'),data:'0x'}),'Use requestRental');
      await reject(()=>provider.call({from:addresses[0],to:loop.address,value:E('1'),data:'0x1234'}),'Function does not exist');
    }
    if (n === 16) {
      eq((await loop.getUserRentals(addresses[2])).map(String).join(','),'1,4');
      console.log('Aman rentals: [1,4]');
      for (const who of [2,3]) await tx(loop.connect(signers[who]).withdraw()); eq(await loop.contractBalance(),0);
      const seconds=(Date.now()-started)/1000; if(seconds>=600) throw Error('Rehearsal exceeded ten minutes: '+seconds);
      console.log('ALL 16 STEPS PASS; elapsed '+seconds+' seconds; final escrow=0 ETH');
    }
    next++; console.log('PASS STEP '+n); return 'Step '+n+' complete';
  }};
}
