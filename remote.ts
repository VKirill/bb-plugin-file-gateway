import {Client as FtpClient} from 'basic-ftp';
import {createRequire} from 'node:module';
import type SftpClientType from 'ssh2-sftp-client';
// Keep ssh2 optional native probes out of the BB bundler. Managed Git installs retain runtime dependencies.
const SftpClient=createRequire(import.meta.url)('ssh2-sftp-client') as typeof SftpClientType;
import {Writable} from 'node:stream';
import {posix} from 'node:path';
import type {Connection} from './connections-contract.js';
export function remotePath(connection:Connection,path:string){
 if(!path.startsWith('/')||/[\x00-\x1f]/.test(path))throw new Error('Invalid remote path');
 const normalized=posix.normalize(path);const root=posix.normalize(connection.root);
 if(root!=='/'&&normalized!==root&&!normalized.startsWith(root.replace(/\/$/,'')+'/'))throw new Error('Path is outside connection root');
 return normalized;
}
export async function withRemote<T>(connection:Connection,password:string,action:(remote:{list:(path:string)=>Promise<{name:string;kind:'file'|'directory'|'other'}[]>;download:(path:string,sink:Writable)=>Promise<void>})=>Promise<T>,signal?:AbortSignal):Promise<T>{
 if(!connection.enabled)throw new Error('Connection is disabled');
 const ftp=connection.protocol==='sftp'?null:new FtpClient(15000);
 const sftp=connection.protocol==='sftp'?new SftpClient():null;
 const close=()=>{ftp?.close();if(sftp)void sftp.end().catch(()=>{});};
 const timer=setTimeout(close,60000);signal?.addEventListener('abort',close,{once:true});
 try{
  signal?.throwIfAborted();
  if(ftp)await ftp.access({host:connection.hostname,port:connection.port,user:connection.username,password,secure:connection.protocol==='ftps'});
  if(sftp)await sftp.connect({host:connection.hostname,port:connection.port,username:connection.username,password,readyTimeout:15000,hostHash:'sha256',hostVerifier:(hash:string)=>hash.toLowerCase()===connection.fingerprint?.toLowerCase()});
  async function checked(target:string){
   const path=remotePath(connection,target);
   if(sftp){const root=posix.normalize(await sftp.realPath(connection.root));const real=posix.normalize(await sftp.realPath(path));if(root!=='/'&&real!==root&&!real.startsWith(root.replace(/\/$/,'')+'/'))throw new Error('Symbolic link leaves connection root');return real;}
   let parent=posix.normalize(connection.root);const relative=posix.relative(parent,path);const parts=relative.split('/').filter(Boolean);if(parts.length>64)throw new Error('Remote path too deep');
   for(const name of parts){const entry=(await ftp!.list(parent)).find(e=>e.name===name);if(!entry||entry.isSymbolicLink)throw new Error('Missing path or symbolic link');parent=posix.join(parent,name);}return path;
  }
  return await action({
   list:async path=>{
    const target=await checked(path);
    if(ftp)return (await ftp.list(target)).map(e=>({name:e.name,kind:e.isSymbolicLink?'other':e.isDirectory?'directory':e.isFile?'file':'other'}));
    return (await sftp!.list(target)).map(e=>({name:e.name,kind:e.type==='d'?'directory':e.type==='-'?'file':'other'}));
   },
   download:async(path,sink)=>{const target=await checked(path);if(ftp){await ftp.size(target);await ftp.downloadTo(sink,target);}else {const info=await sftp!.stat(target);if(!info.isFile)throw new Error('Not a regular file');await sftp!.get(target,sink);}},
  });
 }catch(error){if(signal?.aborted)throw new Error('Transfer cancelled');throw new Error('Remote operation failed. Check connection, permissions, TLS certificate or SFTP fingerprint.');}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',close);close();}
}
export async function downloadBounded(connection:Connection,password:string,path:string,limit:number,signal?:AbortSignal){
 const chunks:Buffer[]=[];let bytes=0;
 const sink=new Writable({write(chunk:Buffer,_encoding,callback){bytes+=chunk.length;if(bytes>limit){callback(new Error('File exceeds transfer limit'));return;}chunks.push(Buffer.from(chunk));callback();}});
 // The transport owns error propagation; keep stream errors handled during shutdown.
 sink.on('error',()=>{});
 await withRemote(connection,password,r=>r.download(path,sink),signal);
 return Buffer.concat(chunks);
}
