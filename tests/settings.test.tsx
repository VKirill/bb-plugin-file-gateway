// @vitest-environment jsdom
import {afterEach,expect,test} from 'vitest';
import {fireEvent,cleanup,waitFor} from '@testing-library/react';
import {loadPluginApp,renderSlot} from '@get-bb/plugin-sdk/testing/app';
import type {SettingsView} from '../configuration.js';
afterEach(cleanup);
async function setup(fail=false){
 let data:SettingsView={revision:0,maxFileMiB:256,machines:[{id:'mini',name:'Mac mini',status:'connected',policy:{mode:'folders',roots:['/Documents'],deny:[]}}]};
 const app=await loadPluginApp(()=>import('../app.js'));
 const slot=renderSlot(app.settingsSections[0],{}, {rpc:{configuration:()=>data,saveMachine:input=>{
  if(fail)throw new Error('Не удалось сохранить');
  const i=input as {policy:SettingsView['machines'][number]['policy']};data={...data,revision:data.revision+1,machines:[{...data.machines[0],policy:i.policy}]};return data;
 },folders:()=>({directory:'/home/me',parent:'/home',entries:[{name:'Documents',path:'/home/me/Documents'}],truncated:false})}});
 await slot.findByText('Mac mini');return {slot,get:()=>data};
}
test('renders machine names without JSON and saves full access mode',async()=>{
 const {slot,get}=await setup();expect(slot.queryByText('Shared folders by host (JSON)')).toBeNull();
 fireEvent.click(slot.getByRole('button',{name:'Всё доступно'}));
 await waitFor(()=>expect(get().machines[0].policy.mode).toBe('all'));
 expect(await slot.findByText(/Включая скрытые файлы/)).toBeTruthy();expect(slot.getByRole('button',{name:'Всё доступно'}).getAttribute('aria-pressed')).toBe('true');
});
test('folder picker uses selected machine and saves selected directory',async()=>{
 const {slot,get}=await setup();fireEvent.click(slot.getByRole('button',{name:'Добавить папку'}));
 await slot.findByRole('button',{name:'Выбрать эту папку'});
 await waitFor(()=>expect(slot.getByRole('button',{name:'Выбрать эту папку'}).hasAttribute('disabled')).toBe(false));
 fireEvent.click(slot.getByRole('button',{name:'Выбрать эту папку'}));await waitFor(()=>expect(get().machines[0].policy.roots).toContain('/home/me'));
});
test('save failure remains visible and does not claim full access',async()=>{
 const {slot}=await setup(true);fireEvent.click(slot.getByRole('button',{name:'Всё доступно'}));
 expect(await slot.findByRole('alert')).toBeTruthy();expect(slot.getByRole('button',{name:'Выбранные папки'}).getAttribute('aria-pressed')).toBe('true');
});
