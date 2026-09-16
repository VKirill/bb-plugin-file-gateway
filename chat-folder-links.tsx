// Folder paths in chat messages: BB renders them as broken app routes, so a
// content script catches the click and hands it to a bridge that the thread
// header button registers (it owns the thread's navigation and RPC hooks).
import {useEffect} from 'react';
import {useBbContext, useBbNavigate, useRpc, type PluginContentScriptContext} from '@get-bb/plugin-sdk/app';
import type {explorerContract} from './explorer-contract.js';
import {folderLinkPath} from './folder-links.js';

type Bridge = (request: {threadId: string; path: string}) => void;
const bridges = new Map<string, Bridge>();

/** Mounted inside each thread header; registers how to open folders for that thread. */
export function useFolderLinkBridge() {
  const rpc = useRpc<typeof explorerContract>();
  const navigate = useBbNavigate();
  const {threadId} = useBbContext();
  useEffect(() => {
    if (!threadId) return;
    const bridge: Bridge = async ({threadId: source, path}) => {
      try {
        const target = await rpc.call('resolve', {threadId: source, path});
        if (target.kind === 'directory') {
          const title = target.path.split('/').filter(Boolean).pop() ?? '/';
          if (!navigate.openThreadPanel({actionId: 'folder', title, params: {hostId: target.hostId, path: target.path}})) throw new Error('Could not open the folder panel');
        } else if (!navigate.experimental_openFilePreview({target: {kind: 'host', hostId: target.hostId, path: target.path}, location: null})) {
          throw new Error('Could not open the file preview');
        }
      } catch (e) {
        // Show the reason in a folder tab rather than failing silently.
        const title = path.split('/').filter(Boolean).pop() ?? path;
        navigate.openThreadPanel({actionId: 'folder', title, params: {hostId: '', path, error: e instanceof Error ? e.message : String(e)}});
      }
    };
    bridges.set(threadId, bridge);
    return () => { if (bridges.get(threadId) === bridge) bridges.delete(threadId); };
  }, [rpc, navigate, threadId]);
}

function threadIdFor(anchor: Element): string | null {
  const row = anchor.closest('[data-timeline-row-id]')?.getAttribute('data-timeline-row-id') ?? '';
  return /^(thr_[A-Za-z0-9_-]+)/.exec(row)?.[1] ?? /\/threads\/(thr_[A-Za-z0-9_-]+)/.exec(location.pathname)?.[1] ?? null;
}

export function mountFolderLinks(context: PluginContentScriptContext) {
  const onClick = (event: MouseEvent) => {
    if (event.button !== 0 || event.altKey) return;
    const anchor = (event.target as Element | null)?.closest?.('a[href]');
    if (!anchor || !anchor.closest('[data-message-column]')) return;
    const path = folderLinkPath(anchor.getAttribute('href') ?? '');
    if (!path) return;
    const threadId = threadIdFor(anchor);
    const bridge = (threadId && bridges.get(threadId)) || bridges.values().next().value;
    if (!threadId || !bridge) return;
    event.preventDefault();
    event.stopPropagation();
    bridge({threadId, path});
  };
  document.addEventListener('click', onClick, true);
  const dispose = () => document.removeEventListener('click', onClick, true);
  context.signal.addEventListener('abort', dispose, {once: true});
  return dispose;
}
