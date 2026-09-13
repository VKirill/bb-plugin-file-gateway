import {defineRpcContract} from '@get-bb/plugin-sdk';
import {z} from 'zod';
export const connectionSchema=z.object({id:z.string().uuid(),name:z.string().trim().min(1).max(80),protocol:z.enum(['ftp','ftps','sftp']),hostname:z.string().min(1).max(253).regex(/^[a-zA-Z0-9.:-]+$/),port:z.number().int().min(1).max(65535),username:z.string().min(1).max(200).refine(x=>!/[\r\n\0]/.test(x)),root:z.string().min(1).max(4096).refine(x=>x.startsWith('/')&&!/[\x00-\x1f]/.test(x)),enabled:z.boolean(),fingerprint:z.string().regex(/^[a-fA-F0-9]{64}$/).optional()}).strict().refine(c=>c.protocol!=='sftp'||!!c.fingerprint,{message:'SFTP requires a SHA-256 host key fingerprint (64 hex characters)'});
export type Connection=z.infer<typeof connectionSchema>;
export const connectionsContract=defineRpcContract({
 connections:{input:z.null(),output:z.array(connectionSchema.extend({hasPassword:z.boolean()}))},
 saveConnection:{input:z.object({connection:connectionSchema,password:z.string().max(4096).optional()}).strict(),output:z.object({ok:z.boolean()})},
 removeConnection:{input:z.object({id:z.string().uuid()}).strict(),output:z.object({ok:z.boolean()})},
 testConnection:{input:z.object({id:z.string().uuid()}).strict(),output:z.object({ok:z.boolean()})},
});
