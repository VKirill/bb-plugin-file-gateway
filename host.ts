import { experimental_defineHostEntry } from '@get-bb/plugin-sdk';
import { constants } from 'node:fs';
import { open, opendir, mkdir, unlink, link, stat } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash, type Hash } from 'node:crypto';
import { contract, CHUNK } from './contract.js';
import { checkedPath, lexicalAllowed } from './policy.js';

type Session = { file: FileHandle; path: string; size: number; modifiedAt: number; timer: ReturnType<typeof setTimeout>; kind: 'read'|'write'; offset: number; hash: Hash; final?: string };
export function createEntry() {
 const sessions = new Map<string, Session>();
 async function remove(token: string) {
   const s = sessions.get(token); if (!s) return;
   sessions.delete(token); clearTimeout(s.timer); await s.file.close().catch(()=>{});
   if (s.kind === 'write') await unlink(s.path).catch(()=>{});
 }
 function get(token: string, kind: Session['kind']) {
   const s = sessions.get(token); if (!s || s.kind !== kind) throw new Error('Transfer expired or unknown');
   s.timer.refresh(); return s;
 }
 function add(s: Omit<Session,'timer'>) {
   const token = randomUUID();
   const timer = setTimeout(()=>{ void remove(token); }, 120_000); timer.unref();
   sessions.set(token,{...s,timer}); return token;
 }
 function capacity() { if (sessions.size >= 8) throw new Error('Too many active transfers'); }
 return experimental_defineHostEntry({ contract, handlers: {
   list: async ({path: target,policy,offset,limit}, ctx) => {
     const canonical = await checkedPath(target,policy); const entries: {name:string;kind:'file'|'directory'|'other'}[]=[];
     let seen=0, nextOffset: number|null=null;
     const dir = await opendir(canonical);
     for await (const item of dir) {
       ctx.signal.throwIfAborted();
       try { lexicalAllowed(path.join(canonical,item.name),policy); } catch { continue; }
       if (item.isSymbolicLink() && policy.mode !== 'all') continue;
       if (seen++ < offset) continue;
       if (entries.length === limit) { nextOffset=offset+limit; break; }
       const details=item.isSymbolicLink()?await stat(path.join(canonical,item.name)).catch(()=>null):item;
       entries.push({name:item.name,kind:details?.isFile()?'file':details?.isDirectory()?'directory':'other'});
     }
     return {path:canonical,entries,nextOffset};
   },
   open: async ({path: target,policy,maxBytes},ctx) => {
     capacity(); ctx.signal.throwIfAborted();
     const canonical = await checkedPath(target,policy);
     const file = await open(canonical,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
     try {
       const s = await file.stat();
       if (!s.isFile() || (policy.mode !== 'all' && s.nlink !== 1)) throw new Error('Only regular files with a single hard link are shared');
       if (s.size > maxBytes) throw new Error(`File exceeds limit of ${maxBytes} bytes`);
       const token = add({file,path:canonical,size:s.size,modifiedAt:s.mtimeMs,kind:'read',offset:0,hash:createHash('sha256')});
       return {token,path:canonical,size:s.size,modifiedAt:s.mtimeMs};
     } catch(e) { await file.close(); throw e; }
   },
   read: async ({token,offset,length},ctx) => {
     ctx.signal.throwIfAborted(); const s=get(token,'read');
     const now=await s.file.stat();
     if (now.size !== s.size || now.mtimeMs !== s.modifiedAt) throw new Error('Source changed during transfer');
     const buffer=Buffer.alloc(Math.min(length,Math.max(0,s.size-offset)));
     const {bytesRead}=await s.file.read(buffer,0,buffer.length,offset);
     return {data:buffer.subarray(0,bytesRead).toString('base64'),bytes:bytesRead};
   },
   close: async ({token}) => {await remove(token);return {ok:true};},
   begin: async ({name,size},ctx) => {
     capacity();ctx.signal.throwIfAborted();
     if (path.basename(name)!==name || name==='.' || name==='..' || name.includes('\\') || /[\x00-\x1f]/.test(name)) throw new Error('Invalid filename');
     const inbox=path.join(ctx.experimental_paths.dataDir,'imports'); await mkdir(inbox,{recursive:true,mode:0o700});
     const id=randomUUID(); const target=path.join(inbox,`${id}-${name}`); const partial=target+'.partial';
     const file=await open(partial,'wx',0o600);
     return {token:add({file,path:partial,final:target,size,modifiedAt:0,kind:'write',offset:0,hash:createHash('sha256')})};
   },
   append: async ({token,offset,data},ctx) => {
     ctx.signal.throwIfAborted();const s=get(token,'write');const buffer=Buffer.from(data,'base64');
     if (buffer.length>CHUNK || buffer.toString('base64')!==data || offset!==s.offset || offset+buffer.length>s.size) throw new Error('Invalid transfer chunk');
     let written=0;while(written<buffer.length){const r=await s.file.write(buffer,written,buffer.length-written,offset+written);if(!r.bytesWritten)throw new Error('Write stalled');written+=r.bytesWritten;}
     s.offset+=written;s.hash.update(buffer);return {bytes:written};
   },
   finish: async ({token,sha256},ctx) => {
     ctx.signal.throwIfAborted();const s=get(token,'write');
     if (s.offset!==s.size || s.hash.digest('hex')!==sha256) {await remove(token);throw new Error('Transfer checksum or size mismatch');}
     await s.file.sync();await s.file.close();
     // link is exclusive: a completed file can never overwrite another file.
     await link(s.path,s.final!);await unlink(s.path);sessions.delete(token);clearTimeout(s.timer);
     const result=await stat(s.final!);return {path:s.final!,size:result.size,modifiedAt:result.mtimeMs,sha256};
   },
   cancel: async ({token})=>{await remove(token);return {ok:true};},
 },dispose:async()=>{await Promise.all([...sessions.keys()].map(remove));} });
}
export default createEntry();
