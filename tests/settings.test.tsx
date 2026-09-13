// @vitest-environment jsdom
import {afterEach,expect,test} from 'vitest';
import {fireEvent,cleanup,waitFor} from '@testing-library/react';
import {loadPluginApp,renderSlot} from '@get-bb/plugin-sdk/testing/app';
import type {SettingsView} from '../configuration.js';
afterEach(cleanup);
async function setup(fail=false){
 let data:SettingsView={revision:0,maxFileMiB:256,machines:[{id:'mini',name:'Mac mini',status:'connected',policy:{mode:'folders',roots:['/Documents'],deny:[]}}]};
 const app=await loadPluginApp(()=>import('../app.js'));
 const slot=renderSlot(app.settingsSections.find(s=>s.id==='file-access')!,{}, {rpc:{configuration:()=>data,saveMachine:input=>{
  if(fail)throw new Error('Could not save');
  const i=input as {policy:SettingsView['machines'][number]['policy']};data={...data,revision:data.revision+1,machines:[{...data.machines[0],policy:i.policy}]};return data;
 },folders:()=>({directory:'/home/me',parent:'/home',entries:[{name:'Documents',path:'/home/me/Documents'}],truncated:false})}});
 await slot.findByText('Mac mini');return {slot,get:()=>data};
}
test('renders machine names without JSON and saves full access mode',async()=>{
 const {slot,get}=await setup();expect(slot.queryByText('Shared folders by host (JSON)')).toBeNull();
 fireEvent.click(slot.getByRole('button',{name:'Full computer'}));
 await waitFor(()=>expect(get().machines[0].policy.mode).toBe('all'));
 expect(await slot.findByText(/Includes hidden files/)).toBeTruthy();expect(slot.getByRole('button',{name:'Full computer'}).getAttribute('aria-pressed')).toBe('true');
});
test('folder picker uses selected machine and saves selected directory',async()=>{
 const {slot,get}=await setup();fireEvent.click(slot.getByRole('button',{name:'Add folder'}));
 await slot.findByRole('button',{name:'Select this folder'});
 await waitFor(()=>expect(slot.getByRole('button',{name:'Select this folder'}).hasAttribute('disabled')).toBe(false));
 fireEvent.click(slot.getByRole('button',{name:'Select this folder'}));await waitFor(()=>expect(get().machines[0].policy.roots).toContain('/home/me'));
});
test('save failure remains visible and does not claim full access',async()=>{
 const {slot}=await setup(true);fireEvent.click(slot.getByRole('button',{name:'Full computer'}));
 expect(await slot.findByRole('alert')).toBeTruthy();expect(slot.getByRole('button',{name:'Selected folders'}).getAttribute('aria-pressed')).toBe('true');
});
