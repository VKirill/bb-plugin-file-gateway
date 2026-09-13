import {defineRpcContract} from '@get-bb/plugin-sdk';
import {z} from 'zod';
export const fileReference=z.object({hostId:z.string().min(1).max(128),path:z.string().min(1).max(4096).refine(p=>p.startsWith('/')&&!/[\x00-\x1f]/.test(p))}).strict();
export function encodeReference(ref:z.infer<typeof fileReference>){return encodeURIComponent(JSON.stringify(fileReference.parse(ref)));}
export function decodeReference(id:string){if(id.length>25000)throw new Error('Invalid file reference');return fileReference.parse(JSON.parse(decodeURIComponent(id)));}
export const explorerContract=defineRpcContract({
 machines:{input:z.null(),output:z.array(z.object({id:z.string(),name:z.string(),status:z.string(),roots:z.array(z.string()),configured:z.boolean()}))},
 list:{input:fileReference.extend({offset:z.number().int().min(0).default(0)}),output:z.object({path:z.string(),entries:z.array(z.object({name:z.string(),kind:z.enum(['file','directory','other'])})),nextOffset:z.number().nullable()})},
});
