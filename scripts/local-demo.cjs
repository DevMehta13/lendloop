// Disposable localhost-only chain. All printed keys are PUBLIC test keys.
const fs=require('node:fs');
const path=require('node:path');
const ganache=require('../tests/node_modules/ganache');
const solc=require('../tests/node_modules/solc');
const {ethers}=require('../tests/node_modules/ethers');
const root=path.resolve(__dirname,'..');
async function main(){
 const sources=Object.fromEntries(fs.readdirSync(path.join(root,'contracts')).filter(n=>n.endsWith('.sol')).map(n=>[n,{content:fs.readFileSync(path.join(root,'contracts',n),'utf8')}]));
 const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
 if(output.errors?.length)throw Error(JSON.stringify(output.errors));
 const server=ganache.server({chain:{chainId:31337},wallet:{deterministic:true,totalAccounts:4},logging:{quiet:true}});
 await server.listen(8545,'127.0.0.1');
 const provider=new ethers.JsonRpcProvider('http://127.0.0.1:8545');provider.pollingInterval=100;
 const accounts=await provider.listAccounts();
 const deploy=async(name,args=[])=>{const a=output.contracts[name+'.sol'][name];const c=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,accounts[0]).deploy(...args);await c.waitForDeployment();return c;};
 try{
 const rep=await deploy('Reputation');const loop=await deploy('LendLoop',[rep.target,60]);await(await rep.setLendLoop(loop.target)).wait();
 for(const s of accounts.slice(1))await(await loop.registerStudent(await s.getAddress())).wait();
 const lender=loop.connect(accounts[1]);await(await lender['listItem(string,uint256,uint256,uint256,uint256)']('Scientific calculator',ethers.parseEther('0.01'),ethers.parseEther('0.5'),ethers.parseEther('0.05'),7)).wait();
 console.log('\nLocal demo ready. RPC http://127.0.0.1:8545 · chain ID 31337');console.log('LendLoop address: '+loop.target);console.log('Reputation address: '+rep.target);console.log('\nPUBLIC LOCAL TEST KEYS — never send real funds to these accounts.');
 const keys=server.provider.getInitialAccounts();let i=0;for(const [address,info] of Object.entries(keys))console.log(`${['Admin','Lender','Borrower','Borrower'][i++]}: ${address}\nPublic test key: ${info.secretKey}`);
 console.log('\nIn another terminal: python3 -m http.server 8000 --directory frontend\nOpen http://localhost:8000 in your MetaMask browser. Paste the LendLoop address above.\nKeep this process running. Ctrl+C stops the disposable chain; restarting resets all demo data.');
 const stop=async()=>{provider.destroy();await server.close();process.exit(0);};process.once('SIGINT',stop);process.once('SIGTERM',stop);
 }catch(error){provider.destroy();await server.close();throw error;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
