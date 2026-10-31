const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const ganache=require('ganache');
const solc=require('solc');
const {ethers}=require('ethers');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'frontend/index.html'),'utf8');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,message){for(let i=0;i<250;i++){if(fn())return;await pause(40);}throw Error(message);}
async function main(){
 const sources=Object.fromEntries(fs.readdirSync(path.join(root,'contracts')).filter(n=>n.endsWith('.sol')).map(n=>[n,{content:fs.readFileSync(path.join(root,'contracts',n),'utf8')}]));
 const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
 assert.deepEqual(output.errors||[],[]);
 const embedded=JSON.parse(html.match(/const ABI = (.*);/)[1]);
 assert.deepEqual(embedded,output.contracts['LendLoop.sol'].LendLoop.abi,'Embedded ABI matches source');
 const chain=ganache.provider({chain:{chainId:31337},logging:{quiet:true},wallet:{totalAccounts:4},miner:{timestampIncrement:0}});
 const provider=new ethers.BrowserProvider(chain);provider.pollingInterval=10;
 const signers=await Promise.all([0,1,2,3].map(i=>provider.getSigner(i)));
 const addresses=await Promise.all(signers.map(s=>s.getAddress()));
 const deploy=async(name,args=[])=>{const a=output.contracts[name+'.sol'][name];const c=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,signers[0]).deploy(...args);await c.waitForDeployment();return c;};
 const rep=await deploy('Reputation'),loop=await deploy('LendLoop',[await rep.getAddress(),60]);await(await rep.setLendLoop(await loop.getAddress())).wait();
 const windows=[];
 function page(account,{wallet=true,library=true}={}){
  const handlers={};const injected={request:async({method,params})=>{if(method==='eth_requestAccounts'||method==='eth_accounts')return [account];return chain.request({method,params:params||[]});},on:(event,cb)=>handlers[event]=cb};
  const dom=new JSDOM(html.replace(/<script src=.*?<\/script>/,''),{url:'http://localhost:8000',runScripts:'dangerously',beforeParse(w){if(library)w.ethers=ethers;if(wallet)w.ethereum=injected;}});windows.push(dom.window);
  const w=dom.window,d=w.document,$=id=>d.getElementById(id);
  const submit=id=>$(id).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  const click=async(label)=>{await until(()=>!$('connect').disabled,'Ready for '+label);const b=[...d.querySelectorAll('button')].find(b=>b.textContent===label);assert.ok(b,'Button '+label);assert.equal(b.disabled,false,label+' enabled');b.click();await pause(20);};
  return {w,d,$,submit,click,handlers,async connect(){ $('contract-address').value=loop.target;submit('connect-form');await until(()=>$('wallet').textContent.includes(account),'Connect '+account+': '+$('notice').textContent);await until(()=>!$('connect').disabled,'Connection completed');},async refresh(){await click('Refresh data');await until(()=>!$('connect').disabled,'Refresh complete');}};
 }
 try{
 const missing=page(addresses[0],{wallet:false});missing.$('contract-address').value=loop.target;missing.submit('connect-form');await until(()=>missing.$('notice').textContent.includes('MetaMask'),'Missing wallet error');
 const offline=page(addresses[0],{library:false});assert.match(offline.$('notice').textContent,/Could not load ethers/);
 const admin=page(addresses[0]);admin.$('contract-address').value=loop.target;admin.$('chain-id').value='1';admin.submit('connect-form');await until(()=>admin.$('notice').textContent.includes('Wrong network'),'Wrong chain rejection');assert.equal(admin.$('listing-fields').disabled,true);admin.$('chain-id').value='31337';
 await admin.connect();assert.equal(admin.$('admin-panel').hidden,false);assert.equal(admin.$('listing-fields').disabled,true);
 admin.$('student-address').value=addresses[1];admin.submit('student-form');await until(()=>admin.$('notice').textContent.includes('Transaction confirmed'),'Register lender');await until(()=>!admin.$('connect').disabled,'Ready');
 admin.$('student-address').value=addresses[2];admin.submit('student-form');await until(()=>admin.$('notice').textContent.includes('Transaction confirmed'),'Register borrower');await until(()=>!admin.$('connect').disabled,'Ready');
 assert.equal(await loop.isStudent(addresses[2]),true);
 console.log('PASS: ABI parity, missing library/wallet, wrong network, role gating, admin registration');
 const lender=page(addresses[1]);await lender.connect();lender.$('item-name').value='<img src=x onerror=alert(1)>';lender.submit('list-form');await until(()=>lender.$('items').textContent.includes('<img'),'Listing via page');assert.equal(lender.$('items').querySelector('img'),null,'Untrusted item names are text');
 const borrower=page(addresses[2]);await borrower.connect();await borrower.click('Get quote');await until(()=>borrower.$('items').textContent.includes('Rent · 0.51 ETH'),'Quote rendered');await borrower.click('Rent · 0.51 ETH');await until(()=>borrower.$('rentals').textContent.includes('Requested'),'Request via quote');
 const rental=await loop.getRental(1);assert.equal(rental.rent+rental.deposit,ethers.parseEther('0.51'));assert.equal(rental.borrower,addresses[2]);
 await lender.refresh();await lender.click('Approve');await until(()=>lender.$('rentals').textContent.includes('Approved'),'Approval');await borrower.refresh();await borrower.click('Confirm handover');await until(()=>borrower.$('rentals').textContent.includes('Active'),'Handover');await borrower.click('Mark returned');await until(()=>borrower.$('rentals').textContent.includes('Return claimed'),'Return');await lender.refresh();await lender.click('Confirm return');await until(()=>lender.$('rentals').textContent.includes('Completed'),'Settlement');
 await borrower.refresh();assert.equal(borrower.$('balance').textContent,'0.5');await borrower.click('Rate participant');await until(()=>borrower.$('rentals').textContent.includes('No action needed'),'Rated state');assert.equal(await rep.hasRated(1,addresses[2]),true);
 await borrower.click('Withdraw balance');await until(()=>borrower.$('balance').textContent==='0.0','Withdraw refund');await lender.refresh();await lender.click('Withdraw balance');await until(()=>lender.$('balance').textContent==='0.0','Withdraw rent');assert.equal(await loop.contractBalance(),0n);
 await until(()=>borrower.$('events').textContent.includes('RentalSettled'),'Live event listener');
 console.log('PASS: safe listing text, exact quote/payment, approve, handover, return, settlement, rating, withdrawals, live events');
 // A second flow verifies dispute controls and admin-only resolution through the page.
 await borrower.refresh();await borrower.click('Get quote');await until(()=>borrower.$('items').textContent.includes('Rent · 0.46 ETH'),'Reputation-discounted quote');await borrower.click('Rent · 0.46 ETH');await until(()=>borrower.$('rentals').textContent.includes('Requested'),'Second request');
 await lender.refresh();await lender.click('Approve');await until(()=>lender.$('rentals').textContent.includes('Approved'),'Second approval');await borrower.refresh();await borrower.click('Confirm handover');await until(()=>borrower.$('rentals').textContent.includes('Active'),'Second handover');
 assert.ok([...borrower.d.querySelectorAll('button')].find(b=>b.textContent==='Claim timeout').disabled,'Early timeout disabled');
 await borrower.click('Mark returned');await until(()=>borrower.$('rentals').textContent.includes('Return claimed'),'Second return');await lender.refresh();lender.d.querySelector('#rentals input[type=text]').value='Damage inspection';await lender.click('Raise dispute');await until(()=>lender.$('rentals').textContent.includes('Disputed'),'Disputed');
 await admin.refresh();assert.match(admin.$('disputes').textContent,/Rental #2/);await admin.click('Resolve dispute');await until(()=>admin.$('disputes').textContent==='','Resolved');assert.equal((await loop.getRental(2)).status,6n);
 await borrower.refresh();await borrower.click('Get quote');await until(()=>borrower.$('items').textContent.includes('Rent · 0.46 ETH'),'Third quote');await borrower.click('Rent · 0.46 ETH');await until(()=>borrower.$('rentals').textContent.includes('Requested'),'Third request');await lender.refresh();await lender.click('Approve');await until(()=>lender.$('rentals').textContent.includes('Approved'),'Third approval');await borrower.refresh();await borrower.click('Confirm handover');await until(()=>borrower.$('rentals').textContent.includes('Active'),'Third handover');await borrower.click('Mark returned');await until(()=>borrower.$('rentals').textContent.includes('Return claimed'),'Third return');
 const third=await loop.getRental(3);await chain.request({method:'evm_setTime',params:[Number(third.returnedAt+120n)*1000]});await chain.request({method:'evm_mine',params:[]});await borrower.refresh();await borrower.click('Claim timeout');await until(()=>borrower.$('rentals').textContent.split('Completed').length===3,'Timeout settlement');assert.equal((await loop.getRental(3)).status,4n);
 console.log('PASS: enabled timeout control settles after the confirmation deadline');
 borrower.handlers.accountsChanged([addresses[3]]);assert.equal(borrower.$('listing-fields').disabled,true);assert.equal(borrower.$('balance').textContent,'—');assert.match(borrower.$('notice').textContent,/account changed/);
 lender.handlers.chainChanged('0x1');assert.equal(lender.$('rentals').children.length,0);assert.match(lender.$('notice').textContent,/network changed/);
 console.log('PASS: discounted quote, early timeout gating, dispute/resolution, account/network session invalidation');
 }catch(error){console.error(windows.map(w=>({notice:w.document.getElementById('notice').textContent,wallet:w.document.getElementById('wallet').textContent,balance:w.document.getElementById('balance').textContent,rentals:w.document.getElementById('rentals').textContent})));throw error;}finally{await pause(1200);for(const w of windows){w.ethereum?.on && w.dispatchEvent(new w.Event('beforeunload'));w.close();}provider.destroy();await chain.disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
