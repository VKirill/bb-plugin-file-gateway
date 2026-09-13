import { defineRpcContract } from '@get-bb/plugin-sdk';
import { z } from 'zod';
export const CHUNK = 512 * 1024;
export const MAX_FILE = 256 * 1024 * 1024;
const path = z.string().min(1).max(4096);
export const policySchema = z.object({ mode: z.enum(['off','folders','all']).optional(), roots: z.array(path).max(100), deny: z.array(path).max(100) }).strict();
export const policiesSchema = z.record(z.string().min(1), policySchema);
export const infoSchema = z.object({ path, size: z.number(), modifiedAt: z.number() });
const token = z.string().uuid();
export const contract = defineRpcContract({
  list: { input: z.object({ path, policy: policySchema, offset: z.number().int().min(0), limit: z.number().int().min(1).max(200) }).strict(), output: z.object({ path, entries: z.array(z.object({ name: z.string(), kind: z.enum(['file','directory','other']) })), nextOffset: z.number().nullable() }) },
  open: { input: z.object({ path, policy: policySchema, maxBytes: z.number().int().min(1).max(MAX_FILE) }).strict(), output: infoSchema.extend({ token }) },
  read: { input: z.object({ token, offset: z.number().int().min(0), length: z.number().int().min(1).max(CHUNK) }).strict(), output: z.object({ data: z.string().max(CHUNK*2), bytes: z.number() }) },
  close: { input: z.object({ token }).strict(), output: z.object({ ok: z.boolean() }) },
  begin: { input: z.object({ name: z.string().min(1).max(240), size: z.number().int().min(0).max(MAX_FILE) }).strict(), output: z.object({ token }) },
  append: { input: z.object({ token, offset: z.number().int().min(0), data: z.string().max(CHUNK*2) }).strict(), output: z.object({ bytes: z.number() }) },
  finish: { input: z.object({ token, sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict(), output: infoSchema.extend({ sha256: z.string() }) },
  cancel: { input: z.object({ token }).strict(), output: z.object({ ok: z.boolean() }) },
});
