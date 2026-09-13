// @vitest-environment jsdom
import {afterEach,expect,test} from 'vitest';
import {fireEvent,cleanup,waitFor} from '@testing-library/react';
import {loadPluginApp,renderSlot} from '@get-bb/plugin-sdk/testing/app';
import {decodeReference} from '../explorer-contract.js';
HTMLElement.prototype.scrollIntoView=()=>{};
HTMLElement.prototype.hasPointerCapture=()=>false;
HTMLElement.prototype.setPointerCapture=()=>{};
HTMLElement.prototype.releasePointerCapture=()=>{};
afterEach(()=>{cleanup();window.localStorage?.clear();});
test('tree targets selected host and inserts native mention without replacing draft',async()=>{
 const app=await loadPluginApp(()=>import('../app.js'));const calls:unknown[]=[];
 const slot=renderSlot(app.threadPanelActions.find(a=>a.id==='explorer')!,{threadId:'thread',params:null},{composer:{text:'Read this'},rpc:{machines:()=>[{id:'ovh',name:'OVH',status:'connected',roots:['/shared'],configured:true},{id:'mini',name:'Mini',status:'connected',roots:['/shared'],configured:true}],list:input=>{calls.push(input);return {path:'/shared',entries:[{name:'a [1].txt',kind:'file'}],nextOffset:null};}}});
 await slot.findByText('OVH');
 fireEvent.click(await slot.findByRole('button',{name:'В чат: OVH:/shared/a [1].txt'}));
 expect(calls).toEqual([{hostId:'ovh',path:'/shared',offset:0}]);expect(slot.getByRole('button',{name:'/shared'}).getAttribute('aria-expanded')).toBe('true');expect(slot.composer.mentions).toHaveLength(1);expect(decodeReference(slot.composer.mentions[0].id)).toEqual({hostId:'ovh',path:'/shared/a [1].txt'});expect(slot.composer.text).toContain('Read this');
});
test('connection form sends password only on save and never renders stored secret',async()=>{
 const app=await loadPluginApp(()=>import('../app.js'));let saved:any;
 const slot=renderSlot(app.settingsSections.find(s=>s.id==='connections')!,{},{rpc:{connections:()=>[],saveConnection:input=>{saved=input;return {ok:true};}}});
 fireEvent.click(slot.getByRole('button',{name:'Добавить подключение'}));
 fireEvent.change(slot.getByLabelText('Название'),{target:{value:'Site'}});fireEvent.change(slot.getByLabelText('Адрес сервера'),{target:{value:'ftp.example.com'}});fireEvent.change(slot.getByLabelText('Логин'),{target:{value:'user'}});fireEvent.change(slot.getByLabelText('Пароль'),{target:{value:'fixture-only'}});
 fireEvent.click(slot.getByRole('button',{name:'Сохранить'}));await waitFor(()=>expect(saved.password).toBe('fixture-only'));expect(saved.connection.protocol).toBe('ftps');await slot.findByText('Подключение сохранено');expect(slot.queryByLabelText('Пароль')).toBeNull();
});

test('header folder icon opens native right panel',async()=>{const app=await loadPluginApp(()=>import('../app.js'));const slot=renderSlot(app.threadHeaderActions[0],{threadId:'thread',projectId:'project',isCompactViewport:false});fireEvent.click(slot.getByRole('button',{name:'Открыть файлы подключений'}));expect(slot.navigateCalls).toEqual([{method:'openThreadPanel',options:{actionId:'explorer',title:'Файлы подключений'}}]);});

test('hidden files and directories toggle without fetching contents or nested folders',async()=>{const app=await loadPluginApp(()=>import('../app.js'));let calls=0;const slot=renderSlot(app.threadPanelActions.find(a=>a.id==='explorer')!,{threadId:'thread',params:null},{rpc:{machines:()=>[{id:'mini',name:'Mini',status:'connected',roots:['/shared'],configured:true}],list:()=>{calls++;return {path:'/shared',entries:[{name:'.cache',kind:'directory'},{name:'.env',kind:'file'},{name:'public',kind:'directory'}],nextOffset:null};}}});await slot.findByRole('button',{name:'public'});expect(slot.queryByRole('button',{name:'.cache'})).toBeNull();expect(slot.queryByText('.env')).toBeNull();fireEvent.click(slot.getByRole('checkbox',{name:'Скрытые файлы и папки'}));expect(slot.getByRole('button',{name:'.cache'}).getAttribute('aria-expanded')).toBe('false');expect(slot.getByText('.env')).toBeTruthy();expect(calls).toBe(1);fireEvent.click(slot.getByRole('checkbox',{name:'Скрытые файлы и папки'}));expect(slot.queryByText('.env')).toBeNull();expect(calls).toBe(1);});

test('double click opens the validated file in native preview',async()=>{
 const app=await loadPluginApp(()=>import('../app.js'));
 const slot=renderSlot(app.threadPanelActions.find(a=>a.id==='explorer')!,{threadId:'thread',params:null},{openFilePreview:()=>true,rpc:{machines:()=>[{id:'mini',name:'Mini',status:'connected',roots:['/shared'],configured:true}],list:()=>({path:'/shared',entries:[{name:'hello.txt',kind:'file'}],nextOffset:null}),preview:input=>input}});
 fireEvent.doubleClick(await slot.findByText('hello.txt'));
 await waitFor(()=>expect(slot.navigateCalls).toEqual([{method:'experimental_openFilePreview',options:{target:{kind:'host',hostId:'mini',path:'/shared/hello.txt'},location:null}}]));
});

test('drag payload preserves remote identity and rejects malformed references',async()=>{
 const {beginFileDrag,parseFileDrop,GATEWAY_DRAG}=await import('../drag-to-chat.js');const values=new Map<string,string>();
 const dataTransfer={effectAllowed:'',setData:(key:string,value:string)=>values.set(key,value)};
 beginFileDrag({dataTransfer} as any,'remote_site','/public/a [1].txt','Site');
 const mention=parseFileDrop(values.get(GATEWAY_DRAG)!);
 expect(decodeReference(mention.id)).toEqual({hostId:'remote_site',path:'/public/a [1].txt'});expect(mention.provider).toBe('files');expect(dataTransfer.effectAllowed).toBe('copy');
 expect(()=>parseFileDrop('{"id":"bad","label":"file"}')).toThrow();
});
