// @vitest-environment jsdom
import {afterEach,expect,test} from 'vitest';
import {fireEvent,cleanup,waitFor} from '@testing-library/react';
import {loadPluginApp,renderSlot} from '@get-bb/plugin-sdk/testing/app';
import {decodeReference} from '../explorer-contract.js';
afterEach(cleanup);
test('tree targets selected host and inserts native mention without replacing draft',async()=>{
 const app=await loadPluginApp(()=>import('../app.js'));const calls:unknown[]=[];
 const slot=renderSlot(app.threadPanelActions.find(a=>a.id==='explorer')!,{threadId:'thread',params:null},{composer:{text:'Read this'},rpc:{machines:()=>[{id:'mini',name:'Mini',status:'connected',roots:['/shared'],configured:true},{id:'ovh',name:'OVH',status:'connected',roots:['/shared'],configured:true}],list:input=>{calls.push(input);return {path:'/shared',entries:[{name:'a [1].txt',kind:'file'}],nextOffset:null};}}});
 await slot.findByText('Mini');fireEvent.click(slot.getAllByRole('button',{name:'▸ /shared'})[1]);
 fireEvent.click(await slot.findByRole('button',{name:'В чат: OVH:/shared/a [1].txt'}));
 expect(calls).toEqual([{hostId:'ovh',path:'/shared',offset:0}]);expect(slot.composer.mentions).toHaveLength(1);expect(decodeReference(slot.composer.mentions[0].id)).toEqual({hostId:'ovh',path:'/shared/a [1].txt'});expect(slot.composer.text).toContain('Read this');
});
test('connection form sends password only on save and never renders stored secret',async()=>{
 const app=await loadPluginApp(()=>import('../app.js'));let saved:any;
 const slot=renderSlot(app.settingsSections.find(s=>s.id==='connections')!,{},{rpc:{connections:()=>[],saveConnection:input=>{saved=input;return {ok:true};}}});
 fireEvent.click(slot.getByRole('button',{name:'Добавить подключение'}));
 fireEvent.change(slot.getByLabelText('Название'),{target:{value:'Site'}});fireEvent.change(slot.getByLabelText('Адрес сервера'),{target:{value:'ftp.example.com'}});fireEvent.change(slot.getByLabelText('Логин'),{target:{value:'user'}});fireEvent.change(slot.getByLabelText('Пароль'),{target:{value:'fixture-only'}});
 fireEvent.click(slot.getByRole('button',{name:'Сохранить'}));await waitFor(()=>expect(saved.password).toBe('fixture-only'));expect(saved.connection.protocol).toBe('ftps');await slot.findByText('Подключение сохранено');expect(slot.queryByLabelText('Пароль')).toBeNull();
});
