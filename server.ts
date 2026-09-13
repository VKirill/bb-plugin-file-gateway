import type { BbPluginApi } from '@get-bb/plugin-sdk';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { contract, CHUNK, MAX_FILE } from './contract.js';
import { configSchema, uiContract, type Configuration } from './configuration.js';
const hostId=z.string().min(1).max(128);
const filepath=z.string().min(1).max(4096);
export const requestSchema=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('hosts')}).strict(),
 z.object({operation:z.literal('list'),hostId,path:filepath,offset:z.number().int().min(0).default(0),limit:z.number().int().min(1).max(200).default(100)}).strict(),
 z.object({operation:z.literal('read'),hostId,path:filepath,offset:z.number().int().min(0).default(0),maxBytes:z.number().int().min(1).max(128*1024).default(32*1024)}).strict(),
 z.object({operation:z.literal('copy'),hostId,path:filepath,destinationHostId:hostId}).strict(),
]);
export default function plugin(bb:BbPluginApi){
 async function configuration(){
  return configSchema.parse(await bb.storage.kv.get('config-v2')??{shares:{},revision:0,maxFileMiB:256});
 }
 async function view(){const cfg=await configuration();const machines=await bb.sdk.hosts.list();return {revision:cfg.revision,maxFileMiB:cfg.maxFileMiB,machines:machines.map(h=>({id:h.id,name:h.name,status:h.status,policy:cfg.shares[h.id]??{mode:'off' as const,roots:[],deny:[]}}))};}
 let writes=Promise.resolve();
 function update(revision:number,change:(cfg:Configuration)=>void){
  const task=writes.then(async()=>{const cfg=await configuration();if(cfg.revision!==revision)throw new Error('Настройки изменились в другом окне. Обновите страницу.');change(cfg);cfg.revision++;await bb.storage.kv.set('config-v2',configSchema.parse(cfg));return view();});
  writes=task.then(()=>{},()=>{});return task;
 }
 bb.rpc.register(uiContract,{
  configuration:()=>view(),
  saveMachine:async({hostId,revision,policy})=>{
   if(!(await bb.sdk.hosts.list()).some(h=>h.id===hostId))throw new Error('Машина больше не подключена к BB');
   if([...policy.roots,...policy.deny].some(p=>!p.startsWith('/')||p.includes('\0')))throw new Error('Укажите абсолютный путь к папке');
   return update(revision,cfg=>{cfg.shares[hostId]=policy;});
  },
  saveLimit:({revision,maxFileMiB})=>update(revision,cfg=>{cfg.maxFileMiB=maxFileMiB;}),
  folders:async({hostId,path})=>{
   const result=await bb.sdk.hosts.directory({hostId,path});const folders=result.entries.filter(e=>e.kind==='directory');
   return {directory:result.directory,parent:result.parent,entries:folders.slice(0,500).map(e=>({name:e.name,path:e.path})),truncated:folders.length>500};
  },
 });
 const host=bb.hosts.experimental_client({contract});
 let activeCopies=0;
 async function run(raw:unknown,signal?:AbortSignal){
  const input=requestSchema.parse(raw);const cfg=await configuration();const policies=cfg.shares;
  const hosts=await bb.sdk.hosts.list();
  if(input.operation==='hosts')return hosts.map(h=>({id:h.id,name:h.name,status:h.status,mode:policies[h.id]?.mode??(policies[h.id]?'folders':'off'),roots:policies[h.id]?.mode==='all'?['/']:policies[h.id]?.roots??[],configured:!!policies[h.id]&&policies[h.id].mode!=='off'}));
  const ensureHost=(id:string)=>{const h=hosts.find(h=>h.id===id);if(!h)throw new Error('Unknown enrolled host');if(h.status!=='connected')throw new Error('Host is offline');};
  ensureHost(input.hostId);
  const policy=policies[input.hostId];if(!policy||policy.mode==='off'||(policy.mode!=='all'&&!policy.roots.length))throw new Error('No shared folders configured for source host');
  const opts={hostId:input.hostId,signal};
  if(input.operation==='list')return host.call('list',{path:input.path,policy,offset:input.offset,limit:input.limit},opts);
  if(input.operation==='read'){
   const source=await host.call('open',{path:input.path,policy,maxBytes:cfg.maxFileMiB*1024*1024},opts);
   try {const result=await host.call('read',{token:source.token,offset:input.offset,length:input.maxBytes},opts);
    const bytes=Buffer.from(result.data,'base64');if(bytes.includes(0))throw new Error('Binary file: use copy to download it');
    let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new Error('Not a complete UTF-8 segment; use copy or adjust byte range');}
    return {hostId:input.hostId,path:source.path,size:source.size,modifiedAt:source.modifiedAt,offset:input.offset,bytes:result.bytes,text,nextOffset:input.offset+result.bytes<source.size?input.offset+result.bytes:null};
   }finally{await host.call('close',{token:source.token},{hostId:input.hostId}).catch(()=>{});}
  }
  ensureHost(input.destinationHostId);
  if(!policies[input.destinationHostId]||policies[input.destinationHostId].mode==='off')throw new Error('Destination host is not enabled in shares');
  if(activeCopies>=2)throw new Error('Two transfers are already active; retry later');
  activeCopies++;
  let sourceToken:string|undefined,destinationToken:string|undefined;
  try{
   const source=await host.call('open',{path:input.path,policy,maxBytes:Math.min(MAX_FILE,cfg.maxFileMiB*1024*1024)},opts);sourceToken=source.token;
   const destination={hostId:input.destinationHostId,signal};
   const started=await host.call('begin',{name:source.path.split('/').pop()!,size:source.size},destination);destinationToken=started.token;
   const hash=createHash('sha256');let offset=0;
   while(offset<source.size){
    signal?.throwIfAborted();
    // Settings revocations apply between chunks as well as between calls.
    const current=await configuration();if(current.revision!==cfg.revision)throw new Error('Settings changed; restart transfer');
    const chunk=await host.call('read',{token:source.token,offset,length:CHUNK},opts);
    if(!chunk.bytes)throw new Error('Unexpected end of source');
    const bytes=Buffer.from(chunk.data,'base64');if(bytes.length!==chunk.bytes)throw new Error('Invalid source chunk');hash.update(bytes);
    await host.call('append',{token:started.token,offset,data:chunk.data},destination);offset+=chunk.bytes;
   }
   // Final source check catches edits after the last data chunk.
   await host.call('read',{token:source.token,offset:source.size,length:1},opts);
   const result=await host.call('finish',{token:started.token,sha256:hash.digest('hex')},destination);destinationToken=undefined;
   bb.log.info(`Transfer completed: ${input.hostId} -> ${input.destinationHostId}, ${result.size} bytes`);
   return {source:{hostId:input.hostId,path:source.path},destination:{hostId:input.destinationHostId,...result}};
  }finally{
   if(sourceToken)await host.call('close',{token:sourceToken},{hostId:input.hostId}).catch(()=>{});
   if(destinationToken)await host.call('cancel',{token:destinationToken},{hostId:input.destinationHostId}).catch(()=>{});
   activeCopies--;
  }
 }
 bb.agents.registerTool({name:'bb_file_gateway',description:'Read or copy files on explicitly configured enrolled BB hosts. Discover host IDs and allowed roots with hosts, list directories, read bounded UTF-8 text, or copy a file to another host private imports folder. Copy returns local destination path and SHA-256. No overwrite or delete. Maximum 256 MiB.',parameters:requestSchema,execute:async(input,ctx)=>JSON.stringify(await run(input,ctx.signal))});
 const usage='bb file-gateway hosts | list <host-id> <absolute-path> [offset] | read <host-id> <absolute-path> [offset] [max-bytes] | copy <source-host-id> <absolute-path> <destination-host-id> [--json]';
 bb.cli.register({name:'file-gateway',summary:'Read and transfer files across enrolled BB machines',commands:[{name:'hosts',summary:'Show machines and shared roots',usage:'bb file-gateway hosts'},{name:'list',summary:'List a shared folder',usage:'bb file-gateway list <host-id> <absolute-path> [offset]'},{name:'read',summary:'Read a UTF-8 byte range',usage:'bb file-gateway read <host-id> <absolute-path> [offset] [max-bytes]'},{name:'copy',summary:'Copy to a machine private imports folder',usage:'bb file-gateway copy <source-host-id> <absolute-path> <destination-host-id>'}],async run(argv,ctx){
  const args=argv.filter(x=>x!=='--json');const [op,h,p,a,b]=args;
  if(!op||op==='--help'||op==='help')return {exitCode:0,stdout:usage};
  try{
   let request:unknown;
   if(op==='hosts'&&args.length===1)request={operation:op};
   else if(op==='list'&&args.length>=3&&args.length<=4)request={operation:op,hostId:h,path:p,...(a!==undefined?{offset:Number(a)}:{})};
   else if(op==='read'&&args.length>=3&&args.length<=5)request={operation:op,hostId:h,path:p,...(a!==undefined?{offset:Number(a)}:{}),...(b!==undefined?{maxBytes:Number(b)}:{})};
   else if(op==='copy'&&args.length===4)request={operation:op,hostId:h,path:p,destinationHostId:a};
   else throw new Error(usage);
   return {exitCode:0,stdout:JSON.stringify(await run(request,ctx.signal),null,2)};
  }catch(e){return {exitCode:1,stderr:e instanceof Error?e.message:String(e)};}
 }});
}
