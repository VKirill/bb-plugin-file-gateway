import {defineRpcContract} from '@get-bb/plugin-sdk';
import {z} from 'zod';
import {fileReference} from './reference.js';
export {encodeReference,decodeReference} from './reference.js';
export const explorerContract=defineRpcContract({
 preview:{input:fileReference.extend({threadId:z.string().optional()}),output:fileReference},
 machines:{input:z.null(),output:z.array(z.object({id:z.string(),name:z.string(),status:z.string(),roots:z.array(z.string()),configured:z.boolean()}))},
 list:{input:fileReference.extend({offset:z.number().int().min(0).default(0)}),output:z.object({path:z.string(),entries:z.array(z.object({name:z.string(),kind:z.enum(['file','directory','other'])})),nextOffset:z.number().nullable()})},
 /** Resolve a path written in a chat to a machine and absolute path, relative to the thread's folder. */
 resolve:{input:z.object({threadId:z.string().min(1).max(128),path:z.string().min(1).max(4096)}).strict(),output:fileReference.extend({kind:z.enum(['directory','file'])})},
 /** Temporary URL base serving the files of one folder (BB machines only). */
 folderAssets:{input:fileReference,output:z.object({baseUrl:z.string().nullable()})},
});
