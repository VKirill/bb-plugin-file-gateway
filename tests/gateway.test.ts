import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, writeFile, mkdir, symlink, link, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { experimental_createHostEntryHarness } from '@get-bb/plugin-sdk/testing/host';
import { createFakePluginHost, makeHostResponse, experimental_scanPublicSdkOnly } from '@get-bb/plugin-sdk/testing';
import { createEntry } from '../host.js';
import plugin from '../server.js';
import { lexicalAllowed } from '../policy.js';
import { CHUNK } from '../contract.js';
async function fixture(t: {after(fn:()=>Promise<void>):void}) {
 const root=await realpath(await mkdtemp(path.join(tmpdir(),'gateway-')));
 const data=path.join(root,'data');const shares=path.join(root,'shared');await mkdir(shares);
 const h=experimental_createHostEntryHarness(createEntry(),{experimental_paths:{dataDir:data,tempDir:root}});
 t.after(async()=>{await h.experimental_dispose();await rm(root,{recursive:true,force:true});});
 return {root,shares,data,h,policy:{roots:[shares],deny:[]}};
}
for(const file of ['.env','.env.production','.ssh/id_rsa','folder/private.pem','.bb/bb.db','Cookies','secret/hello.txt','/proc/self/environ'])test(`deny sensitive ${file}`,()=>{
 assert.throws(()=>lexicalAllowed(file.startsWith('/')?file:'/share/'+file,{roots:['/'],deny:[]}));
});
test('root containment and explicit deny',()=>{
 const p={roots:['/share'],deny:['/share/private']};
 assert.equal(lexicalAllowed('/share/ok',p),'/share/ok');
 for(const x of ['/share-other/file','/share/../elsewhere','/share/private/file','relative'])assert.throws(()=>lexicalAllowed(x,p));
});
test('symlink and hard link escapes rejected',async t=>{
 const f=await fixture(t);const outside=path.join(f.root,'outside');await writeFile(outside,'outside');
 await symlink(outside,path.join(f.shares,'sym'));await link(outside,path.join(f.shares,'hard'));
 for(const name of ['sym','hard'])await assert.rejects(f.h.experimental_call('open',{path:path.join(f.shares,name),policy:f.policy,maxBytes:100}));
});
test('directory listing paginated and sensitive entries omitted',async t=>{
 const f=await fixture(t);for(const name of ['one','two','three','.env'])await writeFile(path.join(f.shares,name),'x');
 const a=await f.h.experimental_call('list',{path:f.shares,policy:f.policy,offset:0,limit:2});
 const b=await f.h.experimental_call('list',{path:f.shares,policy:f.policy,offset:a.nextOffset!,limit:2});
 assert.equal(a.entries.length,2);assert.equal(b.entries.length,1);assert.equal(b.nextOffset,null);
 assert.deepEqual([...a.entries,...b.entries].map(x=>x.name).sort(),['one','three','two']);
});
test('file size limit, change detection and closed token',async t=>{
 const f=await fixture(t);const p=path.join(f.shares,'text.txt');await writeFile(p,'hello');
 await assert.rejects(f.h.experimental_call('open',{path:p,policy:f.policy,maxBytes:2}),/limit/);
 const s=await f.h.experimental_call('open',{path:p,policy:f.policy,maxBytes:100});
 await writeFile(p,'changed text');await assert.rejects(f.h.experimental_call('read',{token:s.token,offset:0,length:100}),/changed/);
 await f.h.experimental_call('close',{token:s.token});await assert.rejects(f.h.experimental_call('read',{token:s.token,offset:0,length:100}),/expired/);
});
test('bad checksum removes partial file',async t=>{
 const f=await fixture(t);const s=await f.h.experimental_call('begin',{name:'a.txt',size:1});
 await f.h.experimental_call('append',{token:s.token,offset:0,data:Buffer.from('x').toString('base64')});
 await assert.rejects(f.h.experimental_call('finish',{token:s.token,sha256:'0'.repeat(64)}),/checksum/);
 assert.deepEqual(await readdir(path.join(f.data,'imports')),[]);
});
test('invalid filenames and out-of-order chunks rejected; cancellation cleans up',async t=>{
 const f=await fixture(t);
 for(const name of ['../x','a/b','a\\b','..'])await assert.rejects(f.h.experimental_call('begin',{name,size:1}));
 const s=await f.h.experimental_call('begin',{name:'a',size:1});
 await assert.rejects(f.h.experimental_call('append',{token:s.token,offset:1,data:'eA=='}),/chunk/);
 await f.h.experimental_call('cancel',{token:s.token});assert.deepEqual(await readdir(path.join(f.data,'imports')),[]);
});
test('worker disposal deletes incomplete transfers',async t=>{
 const f=await fixture(t);await f.h.experimental_call('begin',{name:'a',size:1});await f.h.experimental_dispose();
 assert.deepEqual(await readdir(path.join(f.data,'imports')),[]);
});
async function serverFixture(t: Parameters<typeof fixture>[0], afterCall?: (method:string)=>void){
 const src=await fixture(t),dst=await fixture(t);
 const policies={source:src.policy,destination:dst.policy};
 const {bb,harness}=createFakePluginHost({pluginId:'file-gateway',experimental_hostEntry:true,settings:{shares:JSON.stringify(policies)},sdk:{hosts:{list:async()=>[makeHostResponse({id:'source',name:'Source',status:'connected'}),makeHostResponse({id:'destination',name:'Destination',status:'connected'})]}},experimental_callHostRpc:async call=>{
  const h=call.hostId==='source'?src.h:dst.h;
  const result=await h.experimental_call(call.method as never,call.input as never,{signal:call.signal});
  afterCall?.(call.method);return result;
 }});
 await bb.storage.kv.set('config-v2',{shares:policies,revision:0,maxFileMiB:256});plugin(bb);t.after(()=>harness.lifecycle.dispose());return {src,dst,harness};
}
test('server copies binary across hosts with matching SHA and unique destination',async t=>{
 const {src,dst,harness}=await serverFixture(t);const bytes=randomBytes(CHUNK*2+37);const p=path.join(src.shares,'test.bin');await writeFile(p,bytes);
 const args=['copy','source',p,'destination'];
 const first=await harness.behavior.runCli(args);assert.equal(first.exitCode,0,first.stderr);const result=JSON.parse(first.stdout!);
 assert.equal(result.destination.sha256,createHash('sha256').update(bytes).digest('hex'));
 assert.ok(result.destination.path.startsWith(dst.data));assert.deepEqual(await readFile(result.destination.path),bytes);
 assert.equal((await stat(result.destination.path)).mode&0o777,0o600);
 const second=await harness.behavior.runCli(args);assert.equal(second.exitCode,0,second.stderr);assert.notEqual(JSON.parse(second.stdout!).destination.path,result.destination.path);
});
test('empty file transfers successfully',async t=>{
 const {src,harness}=await serverFixture(t);const p=path.join(src.shares,'empty');await writeFile(p,'');
 const r=await harness.behavior.runCli(['copy','source',p,'destination']);assert.equal(r.exitCode,0,r.stderr);assert.equal(JSON.parse(r.stdout!).destination.size,0);
});
test('agent tool reads text; CLI validates inputs and settings revocation',async t=>{
 const {src,harness}=await serverFixture(t);const p=path.join(src.shares,'text');await writeFile(p,'Привет');
 const result=await harness.behavior.callAgentTool('bb_file_gateway',{operation:'read',hostId:'source',path:p});assert.match(JSON.stringify(result),/Привет/);
 assert.equal((await harness.behavior.runCli(['read','source',p,'-1'])).exitCode,1);
 await harness.behavior.callRpc('saveMachine',{hostId:'source',revision:0,policy:{mode:'off',roots:[],deny:[]}});
 assert.equal((await harness.behavior.runCli(['read','source',p])).exitCode,1);
 await assert.rejects(harness.behavior.callRpc('saveMachine',{hostId:'source',revision:1,policy:{roots:['relative'],deny:[]}}));
});
test('offline source fails before host calls',async t=>{
 const {src,harness}=await serverFixture(t);harness.inspection.sdk.stub('hosts.list',async()=>[makeHostResponse({id:'source',status:'disconnected'})]);
 const r=await harness.behavior.runCli(['read','source',path.join(src.shares,'x')]);assert.equal(r.exitCode,1);assert.match(r.stderr!,/offline/);
});
test('public SDK only',async()=>{
 const result=await experimental_scanPublicSdkOnly(path.resolve('.'),{allow:['react','@radix-ui/react-slot','class-variance-authority','clsx','tailwind-merge','vitest','@testing-library/react'].map(x=>new RegExp('^'+x+'$'))});assert.deepEqual(result.violations,[]);assert.deepEqual(result.privateDependencies,[]);
});

test('conversation artifacts can be shared without exposing BB history or credentials',()=>{
 const p={roots:['/work'],deny:[]};
 assert.equal(lexicalAllowed('/work/.bb/chats/thr_abc/artifacts/report.pdf',p),'/work/.bb/chats/thr_abc/artifacts/report.pdf');
 for(const x of ['/work/.bb/bb.db','/work/.bb/chats/thr_abc/history/messages.json','/work/.bb/chats/thr_abc/artifacts/.env'])assert.throws(()=>lexicalAllowed(x,p));
});

test('abort during relayed transfer removes destination partial',async t=>{
 const controller=new AbortController();
 const {src,dst,harness}=await serverFixture(t,method=>{if(method==='append')controller.abort();});
 const p=path.join(src.shares,'large.bin');await writeFile(p,randomBytes(CHUNK+20));
 const result=await harness.behavior.runCli(['copy','source',p,'destination'],{signal:controller.signal});
 assert.equal(result.exitCode,1);assert.deepEqual(await readdir(path.join(dst.data,'imports')),[]);
});

test('full mode reads hidden files and follows symlinks and hard links outside roots',async t=>{
 const f=await fixture(t);const p=path.join(f.root,'.env');await writeFile(p,'synthetic fixture only');
 const alias=path.join(f.shares,'alias');await symlink(p,alias);await link(p,path.join(f.shares,'hard'));
 for(const target of [p,alias,path.join(f.shares,'hard')]){
  const s=await f.h.experimental_call('open',{path:target,policy:{mode:'all',roots:[],deny:[f.root]},maxBytes:100});
  const r=await f.h.experimental_call('read',{token:s.token,offset:0,length:100});assert.equal(Buffer.from(r.data,'base64').toString(),'synthetic fixture only');await f.h.experimental_call('close',{token:s.token});
 }
});
test('disabled mode denies all paths even with roots',()=>{
 assert.throws(()=>lexicalAllowed('/work/a',{mode:'off',roots:['/'],deny:[]}));
});
test('configuration updates preserve other hosts and reject stale revisions',async t=>{
 const {harness}=await serverFixture(t);
 const before=await harness.behavior.callRpc('configuration',null) as any;
 assert.equal(before.machines[0].policy.roots.length,1);
 await harness.behavior.callRpc('saveMachine',{hostId:'source',revision:0,policy:{mode:'all',roots:[],deny:[]}});
 const after=await harness.behavior.callRpc('configuration',null) as any;
 assert.equal(after.machines[0].policy.mode,'all');assert.deepEqual(after.machines[1],before.machines[1]);
 await assert.rejects(harness.behavior.callRpc('saveMachine',{hostId:'destination',revision:0,policy:{mode:'off',roots:[],deny:[]}}));
 await assert.rejects(harness.behavior.callRpc('saveMachine',{hostId:'unknown',revision:1,policy:{mode:'all',roots:[],deny:[]}}));
});
