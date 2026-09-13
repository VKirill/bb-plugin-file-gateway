import {defineRpcContract} from '@get-bb/plugin-sdk';
import {z} from 'zod';
import {fileReference} from './reference.js';
export {encodeReference,decodeReference} from './reference.js';
export const explorerContract=defineRpcContract({
 preview:{input:fileReference.extend({threadId:z.string().optional()}),output:fileReference},
 machines:{input:z.null(),output:z.array(z.object({id:z.string(),name:z.string(),status:z.string(),roots:z.array(z.string()),configured:z.boolean()}))},
 list:{input:fileReference.extend({offset:z.number().int().min(0).default(0)}),output:z.object({path:z.string(),entries:z.array(z.object({name:z.string(),kind:z.enum(['file','directory','other'])})),nextOffset:z.number().nullable()})},
});
