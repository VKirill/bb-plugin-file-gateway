import {z} from 'zod';
export const fileReference=z.object({hostId:z.string().min(1).max(128),path:z.string().min(1).max(4096).refine(p=>p.startsWith('/')&&!/[\x00-\x1f]/.test(p))}).strict();
export function encodeReference(ref:z.infer<typeof fileReference>){return encodeURIComponent(JSON.stringify(fileReference.parse(ref)));}
export function decodeReference(id:string){if(id.length>25000)throw new Error('Invalid file reference');return fileReference.parse(JSON.parse(decodeURIComponent(id)));}
