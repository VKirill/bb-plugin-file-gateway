import { defineRpcContract } from '@get-bb/plugin-sdk';
import { z } from 'zod';
import { policiesSchema, policySchema } from './contract.js';
export const configSchema=z.object({shares:policiesSchema,revision:z.number().int().min(0),maxFileMiB:z.number().int().min(1).max(256)}).strict();
export type Configuration=z.infer<typeof configSchema>;
const machine=z.object({id:z.string(),name:z.string(),status:z.string(),policy:policySchema});
const view=z.object({revision:z.number(),maxFileMiB:z.number(),machines:z.array(machine)});
export const uiContract=defineRpcContract({
 configuration:{input:z.null(),output:view},
 saveMachine:{input:z.object({hostId:z.string(),revision:z.number().int().min(0),policy:policySchema}).strict(),output:view},
 saveLimit:{input:z.object({revision:z.number().int().min(0),maxFileMiB:z.number().int().min(1).max(256)}).strict(),output:view},
 folders:{input:z.object({hostId:z.string(),path:z.string().max(4096).optional()}).strict(),output:z.object({directory:z.string(),parent:z.string().nullable(),entries:z.array(z.object({name:z.string(),path:z.string()})),truncated:z.boolean()})},
});
export type SettingsView=z.infer<typeof view>;
