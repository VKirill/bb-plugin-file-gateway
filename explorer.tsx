import React,{useState,useEffect,useRef} from 'react';
import {useRpc,useComposer,useBbNavigate,useBbContext} from '@get-bb/plugin-sdk/app';
import type {explorerContract} from './explorer-contract.js';
import {encodeReference} from './reference.js';
import {beginFileDrag,endFileDrag} from './drag-to-chat.js';
import {ExplorerIcon,fileIcon} from './explorer-icons.js';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from './components/ui/select.js';
import {Button} from './components/ui/button.js';
type Machine={id:string;name:string;status:string;roots:string[];configured:boolean};
const rowActions='flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(pointer:coarse)]:opacity-100';
function Folder({machine,path,label,initialOpen=false,showHidden}:{machine:Machine;path:string;label:string;initialOpen?:boolean;showHidden:boolean}){
 const rpc=useRpc<typeof explorerContract>();const composer=useComposer();const navigate=useBbNavigate();const {threadId}=useBbContext();
 const [open,setOpen]=useState(initialOpen);const [entries,setEntries]=useState<{name:string;kind:'file'|'directory'|'other'}[]>([]);const [next,setNext]=useState<number|null>(null);const [loaded,setLoaded]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function load(offset=0){setBusy(true);setError('');try{const result=await rpc.call('list',{hostId:machine.id,path,offset});if(mounted.current){setEntries(previous=>(offset?[...previous,...result.entries]:result.entries).sort((a,b)=>Number(b.kind==='directory')-Number(a.kind==='directory')||a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'})));setNext(result.nextOffset);setLoaded(true);}}catch(e){if(mounted.current)setError(e instanceof Error?e.message:String(e));}finally{if(mounted.current)setBusy(false);}}
 useEffect(()=>{if(initialOpen)void load();},[]);
 function add(target:string){composer.insertMention({provider:'files',id:encodeReference({hostId:machine.id,path:target}),label:`${machine.name}: ${target}`});composer.focus();}
 async function preview(target:string){setError('');try{const ref=await rpc.call('preview',{hostId:machine.id,path:target,...(threadId?{threadId}:{})});if(!navigate.experimental_openFilePreview({target:{kind:'host',...ref},location:null}))throw new Error(threadId?'Could not open file preview':'Open an existing chat to preview this file');}catch(e){setError(e instanceof Error?e.message:String(e));}}
 const visible=entries.filter(entry=>showHidden||!entry.name.startsWith('.'));
 return <div className="min-w-0">
  <div className="group flex h-8 items-center rounded-md pr-1 hover:bg-state-hover focus-within:bg-state-hover" title={path} draggable onDragStart={e=>beginFileDrag(e,machine.id,path,machine.name)} onDragEnd={endFileDrag}>
   <button type="button" className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" aria-label={label} aria-expanded={open} onClick={()=>{setOpen(!open);if(!open&&!loaded)void load();}}><ExplorerIcon name="chevron" className={`size-3 text-muted-foreground transition-transform ${open?'rotate-90':''}`}/><ExplorerIcon name="folder" className="size-4 text-muted-foreground"/><span className={`truncate ${initialOpen?'font-medium':''}`}>{label}</span></button>
   <div className={rowActions}>{initialOpen&&<Button size="sm" variant="ghost" className="size-6 p-0" disabled={busy} aria-label={`Refresh folder ${path}`} onClick={()=>void load()}><ExplorerIcon name="refresh" className={`size-3.5 ${busy?'animate-spin':''}`}/></Button>}<Button size="sm" variant="ghost" className="size-6 p-0" aria-label={`Add to chat: ${machine.name}:${path}`} onClick={()=>add(path)}><ExplorerIcon name="plus" className="size-3.5"/></Button></div>
  </div>
  {open&&<div className="ml-3.5 border-l border-border/50 pl-2">
   {visible.map(entry=>{const target=`${path==='/'?'':path}/${entry.name}`;return entry.kind==='directory'?<Folder key={target} machine={machine} path={target} label={entry.name} showHidden={showHidden}/>:<div key={target} className="group flex h-8 min-w-0 items-center gap-2 rounded-md pl-6 pr-1 hover:bg-state-hover focus-within:bg-state-hover" title={target} draggable={entry.kind==='file'} onDragStart={e=>beginFileDrag(e,machine.id,target,machine.name)} onDragEnd={endFileDrag} onDoubleClick={()=>{if(entry.kind==='file')void preview(target);}}><ExplorerIcon name={fileIcon(entry.name)} className="size-4 text-muted-foreground"/><span className="min-w-0 flex-1 truncate text-sm">{entry.name}</span>{entry.kind==='file'&&<div className={rowActions}><Button size="sm" variant="ghost" className="size-6 p-0" aria-label={`Add to chat: ${machine.name}:${target}`} onClick={()=>add(target)}><ExplorerIcon name="plus" className="size-3.5"/></Button></div>}</div>;})}
   {error&&<div className="space-y-1 p-2"><p role="alert" className="break-words text-xs text-destructive">{error}</p><Button size="sm" variant="ghost" onClick={()=>void load()}>Retry</Button></div>}
   {busy&&<div className="space-y-2 px-6 py-3" aria-label="Loading folder"><div className="h-3 w-2/3 animate-pulse rounded bg-muted"/><div className="h-3 w-1/2 animate-pulse rounded bg-muted"/></div>}
   {loaded&&!visible.length&&!busy&&<p className="px-6 py-3 text-xs text-muted-foreground">{entries.length?'Hidden items are not shown':'This folder is empty'}</p>}
   {next!==null&&<Button size="sm" variant="ghost" disabled={busy} onClick={()=>void load(next)}>Show more</Button>}
  </div>}
 </div>;
}
export function GatewayHeaderButton(){
 const navigate=useBbNavigate();
 return <Button type="button" variant="ghost" size="sm" className="size-7 p-0" aria-label="Open connected files" onClick={()=>navigate.openThreadPanel({actionId:'explorer',title:'Connected Files'})}><ExplorerIcon name="folder" className="size-4"/></Button>;
}
export function GatewayExplorer(){
 const rpc=useRpc<typeof explorerContract>();const [machines,setMachines]=useState<Machine[]>([]);const [selected,setSelected]=useState('');const [error,setError]=useState('');const [version,setVersion]=useState(0);
 useEffect(()=>{let live=true;setError('');void rpc.call('machines',null).then(v=>{if(live){setMachines(v);setSelected(previous=>v.some(m=>m.id===previous)?previous:(v.find(m=>m.configured)?.id??v[0]?.id??''));}}).catch(e=>{if(live)setError(String(e));});return()=>{live=false;};},[version]);
 const [showHidden,setShowHidden]=useState(()=>{try{return window.localStorage.getItem('bb:file-gateway:show-hidden')==='true';}catch{return false;}});
 const machine=machines.find(m=>m.id===selected);
 return <div className="flex h-full flex-col" aria-label="Connected Files">
  <div className="shrink-0 space-y-3 border-b border-border px-3 pb-3 pt-2">
   <div className="flex items-center gap-1"><Select value={selected} onValueChange={setSelected}><SelectTrigger aria-label="Machine or FTP connection" className="h-9 min-w-0 flex-1 border-transparent bg-muted/40 px-2 hover:bg-state-hover"><div className="flex min-w-0 items-center gap-2"><ExplorerIcon name={selected.startsWith('remote_')?'globe':'server'} className="size-4 text-muted-foreground"/><SelectValue placeholder="Choose a connection"/></div></SelectTrigger><SelectContent>{machines.map(m=><SelectItem key={m.id} value={m.id}>{m.name}{!m.configured?' — off':!['connected','configured'].includes(m.status)?' — offline':''}</SelectItem>)}</SelectContent></Select><Button size="sm" variant="ghost" className="size-8 shrink-0 p-0 text-muted-foreground" aria-label="Refresh connections" onClick={()=>setVersion(v=>v+1)}><ExplorerIcon name="refresh"/></Button></div>
   <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-1"><span className="text-xs text-muted-foreground">＋ Add to chat</span><label className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted-foreground hover:text-foreground"><input type="checkbox" className="size-3.5 rounded border border-input accent-foreground" checked={showHidden} onChange={e=>{setShowHidden(e.target.checked);try{window.localStorage.setItem('bb:file-gateway:show-hidden',String(e.target.checked));}catch{}}}/>Show hidden files and folders</label></div>
  </div>
  <div className="min-h-0 flex-1 overflow-auto p-2">{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{machine&&(!machine.configured?<p className="p-2 text-xs text-muted-foreground">Access is disabled. Enable it in File Gateway settings.</p>:!['connected','configured'].includes(machine.status)?<p className="p-2 text-xs text-muted-foreground">Offline</p>:machine.roots.map(root=><Folder key={`${machine.id}:${root}:${version}`} machine={machine} path={root} label={root} initialOpen showHidden={showHidden}/>))}</div>
 </div>;
}
