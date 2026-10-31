// Build a self-contained Remix terminal script from the current Solidity sources.
const fs = require('node:fs');
const path = require('node:path');
const solc = require('../tests/node_modules/solc');
const root = path.resolve(__dirname, '..');
const sources = Object.fromEntries(fs.readdirSync(path.join(root, 'contracts')).filter(n => n.endsWith('.sol')).map(n => [n, {content: fs.readFileSync(path.join(root, 'contracts', n), 'utf8')}]));
const output = JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
if (output.errors?.length) throw new Error(JSON.stringify(output.errors));
const artifacts = Object.fromEntries(['Reputation','LendLoop'].map(n => [n,{abi:output.contracts[n+'.sol'][n].abi,bytecode:'0x'+output.contracts[n+'.sol'][n].evm.bytecode.object}]));
fs.writeFileSync(path.join(root,'scripts/phase-5-remix.js'), '(window.phase5 = (' + fs.readFileSync(path.join(__dirname,'demo-runner.js'),'utf8') + ')('+JSON.stringify(artifacts)+'), \"Ready: window.phase5.step(1)\");\n');

const generated = fs.readFileSync(path.join(root,"scripts/phase-5-remix.js"),"utf8");
fs.writeFileSync(path.join(root,"scripts/phase-5-auto.txt"), "(async () => { eval("+JSON.stringify(generated)+"); for (let step=1; step<=16; step++) await window.phase5.step(step); return \"Rehearsal complete\"; })()" );
