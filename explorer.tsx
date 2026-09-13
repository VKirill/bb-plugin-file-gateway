import React,{useState,useEffect,useRef} from 'react';
import {useRpc,useComposer} from '@get-bb/plugin-sdk/app';
import {explorerContract,encodeReference} from './explorer-contract.js';
import {Button} from './components/ui/button.js';
type Machine={id:string;name:string;status:string;roots:string[];configured:boolean};
function Folder({machine,path,label}:{machine:Machine;path:string;label:string}){
 const rpc=useRpc<typeof explorerContract>();const composer=useComposer();
 const [open,setOpen]=useState(false);const [entries,setEntries]=useState<{name:string;kind:'file'|'directory'|'other'}[]>([]);const [next,setNext]=useState<number|null>(null);const [loaded,setLoaded]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function load(offset=0){setBusy(true);setError('');try{const result=await rpc.call('list',{hostId:machine.id,path,offset});if(mounted.current){setEntries(previous=>offset?[...previous,...result.entries]:result.entries);setNext(result.nextOffset);setLoaded(true);}}catch(e){if(mounted.current)setError(e instanceof Error?e.message:String(e));}finally{if(mounted.current)setBusy(false);}}
 function add(target:string){composer.insertMention({provider:'files',id:encodeReference({hostId:machine.id,path:target}),label:`${machine.name}: ${target}`});composer.focus();}
 return <div className="min-w-0">
  <div className="flex items-center gap-1"><button type="button" className="min-w-0 flex-1 truncate rounded px-2 py-1.5 text-left text-sm hover:bg-muted" title={path} aria-expanded={open} onClick={()=>{setOpen(!open);if(!open&&!loaded)void load();}}>{open?'▾':'▸'} {label}</button><Button size="sm" variant="ghost" aria-label={`В чат: ${machine.name}:${path}`} onClick={()=>add(path)}>＋</Button></div>
  {open&&<div className="ml-3 border-l border-border pl-2">
   {entries.map(entry=>{const target=`${path==='/'?'':path}/${entry.name}`;return entry.kind==='directory'?<Folder key={target} machine={machine} path={target} label={entry.name}/>:<div key={target} className="flex min-w-0 items-center gap-1"><span className="min-w-0 flex-1 truncate px-2 py-1 text-sm" title={target}>{entry.name}</span>{entry.kind==='file'&&<Button size="sm" variant="ghost" aria-label={`В чат: ${machine.name}:${target}`} onClick={()=>add(target)}>＋</Button>}</div>;})}
   {error&&<p role="alert" className="break-words p-2 text-xs text-destructive">{error}</p>}
   {busy&&<p className="p-2 text-xs text-muted-foreground">Загрузка…</p>}
   {loaded&&!entries.length&&!busy&&<p className="p-2 text-xs text-muted-foreground">Папка пуста</p>}
   {next!==null&&<Button size="sm" variant="ghost" disabled={busy} onClick={()=>void load(next)}>Показать ещё</Button>}
   <Button size="sm" variant="ghost" disabled={busy} onClick={()=>void load()}>Обновить папку</Button>
  </div>}
 </div>;
}
export function GatewayExplorer(){
 const rpc=useRpc<typeof explorerContract>();const [machines,setMachines]=useState<Machine[]>([]);const [error,setError]=useState('');const [version,setVersion]=useState(0);
 useEffect(()=>{let live=true;setError('');void rpc.call('machines',null).then(v=>{if(live)setMachines(v);}).catch(e=>{if(live)setError(String(e));});return()=>{live=false;};},[version]);
 return <div className="h-full overflow-auto p-3" aria-label="Файлы подключений"><div className="mb-3 flex items-center justify-between"><p className="text-xs text-muted-foreground">＋ добавляет файл или папку в сообщение</p><Button size="sm" variant="ghost" onClick={()=>setVersion(v=>v+1)}>Обновить</Button></div>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{machines.map(machine=><section key={`${machine.id}:${version}`} className="mb-3 rounded-lg border border-border p-2"><h3 className="px-2 py-1 text-sm font-medium">{machine.name}</h3>{!machine.configured?<p className="px-2 text-xs text-muted-foreground">Доступ выключен — включите в настройках File Gateway</p>:!['connected','configured'].includes(machine.status)?<p className="px-2 text-xs text-muted-foreground">Не в сети</p>:machine.roots.map(root=><Folder key={root} machine={machine} path={root} label={root}/>)}</section>)}</div>;
}
