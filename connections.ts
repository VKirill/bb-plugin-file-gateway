import type {BbPluginApi} from '@get-bb/plugin-sdk';
import {z} from 'zod';
import {connectionSchema,connectionsContract,type Connection} from './connections-contract.js';
import {withRemote,remotePath,downloadBounded} from './remote.js';
export function registerConnections(bb:BbPluginApi){
 const secrets=bb.settings.define({connectionVault:{type:'string',label:'Хранилище паролей подключений',description:'Управляется формой подключений File Gateway. Не изменяйте вручную.',secret:true}});
 const schema=z.array(connectionSchema).max(30);
 async function connections(){return schema.parse(await bb.storage.kv.get('connections-v1')??[]);}
 async function passwords(){const raw=(await secrets.get()).connectionVault;return z.record(z.string(),z.string()).parse(raw?JSON.parse(raw):{});}
 let pending=Promise.resolve();
 function mutate(fn:()=>Promise<{ok:boolean}>){const task=pending.then(fn);pending=task.then(()=>{},()=>{});return task;}
 async function get(id:string){const connection=(await connections()).find(c=>c.id===id);if(!connection||!connection.enabled)throw new Error('Connection missing or disabled');const password=(await passwords())[id];if(password===undefined)throw new Error('Connection password is not configured');return {connection,password};}
 bb.rpc.register(connectionsContract,{
  connections:async()=>{const vault=await passwords();return (await connections()).map(c=>({...c,hasPassword:vault[c.id]!==undefined}));},
  saveConnection:input=>mutate(async()=>{const list=await connections();const index=list.findIndex(c=>c.id===input.connection.id);if(index<0)list.push(input.connection);else list[index]=input.connection;schema.parse(list);if(input.password!==undefined){const vault=await passwords();vault[input.connection.id]=input.password;await secrets.experimental_set({connectionVault:JSON.stringify(vault)});}await bb.storage.kv.set('connections-v1',list);return {ok:true};}),
  removeConnection:({id})=>mutate(async()=>{await bb.storage.kv.set('connections-v1',(await connections()).filter(c=>c.id!==id));const vault=await passwords();delete vault[id];await secrets.experimental_set({connectionVault:JSON.stringify(vault)});return {ok:true};}),
  testConnection:async({id})=>{const {connection,password}=await get(id);await withRemote(connection,password,r=>r.list(connection.root));return {ok:true};},
 });
 return {connections,get,async list(id:string,path:string,offset:number,limit:number){const {connection,password}=await get(id);const result=await withRemote(connection,password,r=>r.list(path));const entries=result.filter(e=>e.name!=='.'&&e.name!=='..'&&!/[\/\x00-\x1f]/.test(e.name)).sort((a,b)=>a.name.localeCompare(b.name));return {path:remotePath(connection,path),entries:entries.slice(offset,offset+limit),nextOffset:offset+limit<entries.length?offset+limit:null};},async download(id:string,path:string,limit:number,signal?:AbortSignal){const {connection,password}=await get(id);const bytes=await downloadBounded(connection,password,path,Math.min(limit,32*1024*1024),signal);const current=await get(id);if(JSON.stringify(current.connection)!==JSON.stringify(connection)||current.password!==password)throw new Error('Connection changed during transfer');return bytes;}};
}
