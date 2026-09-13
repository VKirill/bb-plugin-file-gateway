import {GatewayDropTarget} from './drag-to-chat.js';
import {ConnectionSettings} from './connections-ui.js';
import {GatewayExplorer,GatewayHeaderButton} from './explorer.js';
import React,{useEffect,useState} from 'react';
import {definePluginApp,useRpc} from '@get-bb/plugin-sdk/app';
import type {uiContract,SettingsView} from './configuration.js';
import {Button} from './components/ui/button.js';
import {Input} from './components/ui/input.js';
type Machine=SettingsView['machines'][number];
type Policy=Machine['policy'];
const modes=[{id:'off',title:'Выключено',description:'Файлы этой машины недоступны через шлюз.'},{id:'folders',title:'Выбранные папки',description:'Доступ только к папкам из списка.'},{id:'all',title:'Всё доступно',description:'Все файлы, которые может открыть BB на этой машине.'}] as const;
function FolderBrowser({hostId,onSelect,onClose}:{hostId:string;onSelect:(path:string)=>void;onClose:()=>void}){
 const rpc=useRpc<typeof uiContract>();const [listing,setListing]=useState<{directory:string;parent:string|null;entries:{name:string;path:string}[];truncated:boolean}|null>(null);
 const [path,setPath]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 async function browse(target?:string){setBusy(true);setError('');try{const next=await rpc.call('folders',{hostId,...(target?{path:target}:{})});setListing(next);setPath(next.directory);}catch(e){setError(String(e instanceof Error?e.message:e));}finally{setBusy(false);}}
 useEffect(()=>{void browse();},[hostId]);
 return <div className="space-y-3 rounded-md border border-border bg-background p-3" aria-label="Выбор папки">
  <div className="flex items-center justify-between"><span className="text-sm font-medium">Выберите папку на этой машине</span><Button size="sm" variant="ghost" onClick={onClose}>Закрыть</Button></div>
  <form className="flex gap-2" onSubmit={e=>{e.preventDefault();void browse(path);}}><Input aria-label="Путь к папке" value={path} onChange={e=>setPath(e.target.value)} placeholder="/путь/к/папке"/><Button variant="outline" size="sm" disabled={busy}>Перейти</Button></form>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  <div className="max-h-56 overflow-y-auto rounded-md border border-border" aria-busy={busy}>
   {listing?.parent&&<button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-state-hover" disabled={busy} onClick={()=>void browse(listing.parent!)}>↑ На уровень выше</button>}
   {listing?.entries.map(e=><button type="button" key={e.path} className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-state-hover" disabled={busy} onClick={()=>void browse(e.path)}>{e.name} <span className="float-right text-muted-foreground">›</span></button>)}
   {busy?<p className="p-3 text-sm text-muted-foreground">Загрузка…</p>:listing?.entries.length===0&&<p className="p-3 text-sm text-muted-foreground">Вложенных папок нет</p>}
  </div>
  {listing?.truncated&&<p className="text-xs text-muted-foreground">Показаны первые 500 папок. Нужный путь можно ввести выше.</p>}
  <Button size="sm" disabled={busy||!listing||!!error} onClick={()=>listing&&onSelect(listing.directory)}>Выбрать эту папку</Button>
 </div>;
}
function MachineCard({machine,busy,onChange}:{machine:Machine;busy:boolean;onChange:(p:Policy)=>Promise<void>}){
 const [picker,setPicker]=useState<'roots'|'deny'|null>(null);const [manual,setManual]=useState('');
 const mode=machine.policy.mode??'folders';const online=machine.status==='connected';
 function add(field:'roots'|'deny',path:string){if(!path.trim())return;void onChange({...machine.policy,[field]:Array.from(new Set([...machine.policy[field],path.trim()]))});setPicker(null);setManual('');}
 return <section className="rounded-lg border border-border" aria-label={machine.name}>
  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3"><h3 className="text-sm font-medium">{machine.name}</h3><span className="text-xs text-muted-foreground">{online?'Подключена':'Не в сети'}</span></div>
  <div className="space-y-4 p-4">
   <div role="group" aria-label={`Доступ: ${machine.name}`} className="flex flex-wrap gap-1 rounded-md bg-muted p-1">{modes.map(m=><Button key={m.id} type="button" size="sm" className="flex-1" variant={mode===m.id?'default':'ghost'} aria-pressed={mode===m.id} disabled={busy} onClick={()=>{setPicker(null);void onChange({...machine.policy,mode:m.id});}}>{m.title}</Button>)}</div>
   <p className="text-sm text-muted-foreground">{modes.find(m=>m.id===mode)?.description}</p>
   {mode==='all'&&<p className="text-xs text-muted-foreground">Включая скрытые файлы, ключи и настройки приложений. Ограничения шлюза на пути и ссылки отключены. Права macOS/Linux сохраняются. Доступ — чтение и скачивание файлов.</p>}
   {mode==='folders'&&<>
    <div className="space-y-2">{machine.policy.roots.map(p=><div key={p} className="flex items-center gap-2 rounded-md bg-muted/50 pl-3"><span className="min-w-0 flex-1 break-all text-sm">{p}</span><Button size="sm" variant="ghost" aria-label={`Убрать папку ${p}`} disabled={busy} onClick={()=>void onChange({...machine.policy,roots:machine.policy.roots.filter(x=>x!==p)})}>Убрать</Button></div>)}
     {!machine.policy.roots.length&&<p className="text-sm text-muted-foreground">Добавьте папку, чтобы открыть доступ к её файлам.</p>}
    </div>
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy||!online} onClick={()=>setPicker('roots')}>Добавить папку</Button></div>
    <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Исключения и ввод пути</summary><div className="mt-3 space-y-3">
     <p className="text-xs text-muted-foreground">В этом режиме ключи, сессии и другие служебные файлы исключаются автоматически.</p>
     {machine.policy.deny.map(p=><div key={p} className="flex items-center gap-2"><span className="min-w-0 flex-1 break-all">{p}</span><Button size="sm" variant="ghost" disabled={busy} aria-label={`Убрать исключение ${p}`} onClick={()=>void onChange({...machine.policy,deny:machine.policy.deny.filter(x=>x!==p)})}>Убрать</Button></div>)}
     <Button size="sm" variant="outline" disabled={busy||!online} onClick={()=>setPicker('deny')}>Исключить папку</Button>
     <form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();add('roots',manual);}}><Input className="min-w-40 flex-1" aria-label={`Абсолютный путь: ${machine.name}`} value={manual} onChange={e=>setManual(e.target.value)} placeholder="/абсолютный/путь"/><Button size="sm" variant="outline" disabled={busy||!manual.startsWith('/')}>Добавить путь</Button></form>
    </div></details>
    {picker&&<FolderBrowser hostId={machine.id} onClose={()=>setPicker(null)} onSelect={p=>add(picker,p)}/>}
   </>}
  </div>
 </section>;
}
export function GatewaySettings(){
 const rpc=useRpc<typeof uiContract>();const [view,setView]=useState<SettingsView|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [saved,setSaved]=useState(false);const [limit,setLimit]=useState('256');
 async function load(){setError('');try{const data=await rpc.call('configuration',null);setView(data);setLimit(String(data.maxFileMiB));}catch(e){setError(e instanceof Error?e.message:String(e));}}
 useEffect(()=>{void load();},[]);
 async function change(action:()=>Promise<SettingsView>){setBusy(true);setSaved(false);setError('');try{setView(await action());setSaved(true);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 return <div className="space-y-4" aria-label="Файловый доступ между машинами">
  <div className="flex items-start justify-between gap-3"><p className="text-sm text-muted-foreground">Выберите, какие файлы агенты смогут открывать с других машин BB.</p><Button size="sm" variant="ghost" disabled={busy} onClick={()=>void load()}>Обновить</Button></div>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  {!view&&!error&&<p className="text-sm text-muted-foreground">Загрузка машин…</p>}
  {view?.machines.map(machine=><MachineCard key={machine.id} machine={machine} busy={busy} onChange={policy=>change(()=>rpc.call('saveMachine',{hostId:machine.id,policy,revision:view.revision}))}/>)}
  {view?.machines.length===0&&<p className="text-sm text-muted-foreground">Подключите машину к BB — она появится здесь.</p>}
  {view&&<details className="rounded-md border border-border p-3"><summary className="cursor-pointer text-sm">Передача файлов</summary><form className="mt-3 flex flex-wrap items-center gap-3" onSubmit={e=>{e.preventDefault();void change(()=>rpc.call('saveLimit',{revision:view.revision,maxFileMiB:Number(limit)}));}}><label htmlFor="gateway-size" className="text-sm">Максимальный размер, МБ</label><Input id="gateway-size" className="w-24" type="number" min={1} max={256} value={limit} onChange={e=>setLimit(e.target.value)}/><Button size="sm" variant="outline" disabled={busy||!Number.isInteger(Number(limit))||Number(limit)<1||Number(limit)>256}>Сохранить</Button></form></details>}
  <p role="status" className="min-h-4 text-xs text-muted-foreground">{busy?'Сохранение…':saved?'Сохранено. Настройки применяются сразу.':''}</p>
 </div>;
}
export default definePluginApp(app=>{app.composer.customize({id:'file-drop',banners:[{id:'file-drop',chrome:'bare',component:GatewayDropTarget}]});app.slots.experimental_threadHeaderAction({id:'open-files',title:'Файлы подключений',component:GatewayHeaderButton});app.slots.threadPanelAction({id:'explorer',title:'Файлы подключений',layout:'flush',component:GatewayExplorer});app.slots.experimental_newThreadPanelAction({id:'explorer-new',title:'Файлы подключений',layout:'flush',component:GatewayExplorer});app.slots.settingsSection({id:'connections',title:'FTP и SFTP',component:ConnectionSettings});app.slots.settingsSection({id:'file-access',title:'Доступ к файлам',component:GatewaySettings});});
