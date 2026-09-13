import path from 'node:path';
import { lstat, realpath } from 'node:fs/promises';
import type { z } from 'zod';
import type { policySchema } from './contract.js';
export type Policy = z.infer<typeof policySchema>;
const sensitive = /^(?:\.ssh|\.gnupg|\.aws|\.azure|\.kube|\.bb|\.bb-machines|\.codex|\.claude|\.config|\.local|\.git|\.npmrc|\.netrc|\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx|session)|cookies?(?:\..*)?|login data|keychains|secrets?|credentials?(?:\..*)?|id_rsa|id_ed25519)$/i;
export function within(root: string, target: string) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..'+path.sep) && rel !== '..' && !path.isAbsolute(rel));
}
export function lexicalAllowed(target: string, policy: Policy) {
  if (!path.isAbsolute(target) || target.includes('\0')) throw new Error('Use an absolute path');
  const normalized = path.resolve(target);
  const parts = normalized.split(path.sep);
  const isPrivateComponent = (part: string, index: number) => {
    if (!sensitive.test(part)) return false;
    // Share conversation artifacts without exposing BB databases, sessions or history.
    if (part === '.bb' && parts[index+1] === 'chats' && /^thr_[a-z0-9]+$/.test(parts[index+2] ?? '') && ['artifacts','notes','tmp'].includes(parts[index+3] ?? '')) return false;
    return true;
  };
  if (parts.some(isPrivateComponent) || /\/Library\/(?:Application Support|Cookies|Keychains|Safari)(?:\/|$)/i.test(normalized) || /^\/(?:proc|sys|dev)(?:\/|$)/.test(normalized)) throw new Error('Sensitive or special path is excluded');
  if (!policy.roots.some(r => path.isAbsolute(r) && within(path.resolve(r), normalized)) || policy.deny.some(r => within(path.resolve(r), normalized))) throw new Error('Path is outside allowed roots or explicitly denied');
  return normalized;
}
export async function checkedPath(target: string, policy: Policy) {
  const normalized = lexicalAllowed(target, policy);
  // Refuse symlink components instead of silently following them beyond a share.
  let current = path.parse(normalized).root;
  for (const part of normalized.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new Error('Symbolic links are not shared');
  }
  const canonical = await realpath(normalized);
  lexicalAllowed(canonical, policy);
  return canonical;
}
