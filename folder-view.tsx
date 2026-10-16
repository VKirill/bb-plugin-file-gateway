// Folder view: a Finder-like panel tab for one folder on a BB machine —
// grid with image thumbnails or list, breadcrumbs, in-panel preview of
// images/PDF/video/audio, download, add to chat and copy path.
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useBbContext, useBbNavigate, useComposer, useRpc, type PluginThreadPanelProps} from '@get-bb/plugin-sdk/app';
import type {explorerContract} from './explorer-contract.js';
import {encodeReference} from './reference.js';
import {ExplorerIcon, fileIcon} from './explorer-icons.js';
import {Button} from './components/ui/button.js';
import {Icon} from './components/ui/icon.js';
import {zipSync} from 'fflate';
import {assetUrl, crumbs, fileKind, joinPath} from './folder-links.js';

type Entry = {name: string; kind: 'file' | 'directory' | 'other'};
type Params = {hostId: string; path: string; error?: string};
const VIEW_KEY = 'bb:file-gateway:folder-view';

function isParams(value: unknown): value is Params {
  return !!value && typeof value === 'object' && typeof (value as Params).hostId === 'string' && typeof (value as Params).path === 'string';
}

async function download(url: string, name: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(String(response.status));
    const blobUrl = URL.createObjectURL(await response.blob());
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

export function FolderView({params}: PluginThreadPanelProps) {
  const rpc = useRpc<typeof explorerContract>();
  const navigate = useBbNavigate();
  const composer = useComposer();
  const {threadId} = useBbContext();
  const initial = isParams(params) ? params : null;
  const [path, setPath] = useState(initial?.path ?? '/');
  const hostId = initial?.hostId ?? '';
  const [machine, setMachine] = useState('');
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'));
  const [viewer, setViewer] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const [notice, setNotice] = useState(initial?.error ?? '');
  const flash = (text: string) => { setNotice(text); window.setTimeout(() => setNotice((current) => (current === text ? '' : current)), 2500); };

  const load = useCallback(async () => {
    if (!hostId) { setEntries([]); return; }
    setBusy(true);
    setError('');
    try {
      const all: Entry[] = [];
      let offset: number | null = 0;
      while (offset !== null && all.length < 2000) {
        const page: {entries: Entry[]; nextOffset: number | null} = await rpc.call('list', {hostId, path, offset});
        all.push(...page.entries);
        offset = page.nextOffset;
      }
      all.sort((a, b) => Number(b.kind === 'directory') - Number(a.kind === 'directory') || a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'}));
      setEntries(all);
      const assets = await rpc.call('folderAssets', {hostId, path}).catch(() => ({baseUrl: null}));
      setBaseUrl(assets.baseUrl);
    } catch (e) {
      setEntries(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [rpc, hostId, path]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void rpc.call('machines', null).then((list) => setMachine(list.find((m) => m.id === hostId)?.name ?? hostId), () => setMachine(hostId));
  }, [rpc, hostId]);

  const visible = useMemo(() => (entries ?? []).filter((e) => !e.name.startsWith('.')), [entries]);
  const media = useMemo(() => visible.filter((e) => e.kind === 'file' && fileKind(e.name) !== 'document').map((e) => e.name), [visible]);
  const url = (name: string) => (baseUrl ? assetUrl(baseUrl, name) : null);

  async function openDocument(name: string) {
    try {
      const ref = await rpc.call('preview', {hostId, path: joinPath(path, name), ...(threadId ? {threadId} : {})});
      if (!navigate.experimental_openFilePreview({target: {kind: 'host', ...ref}, location: null})) throw new Error('Could not open the file preview');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
  }
  function open(entry: Entry) {
    if (entry.kind === 'directory') { setPath(joinPath(path, entry.name)); return; }
    if (fileKind(entry.name) !== 'document' && baseUrl) setViewer(entry.name);
    else void openDocument(entry.name);
  }
  function addToChat(target: string) {
    composer.insertMention({provider: 'files', id: encodeReference({hostId, path: target}), label: `${machine || hostId}: ${target}`});
    composer.focus();
  }
  function copyPath(target: string) {
    void navigator.clipboard.writeText(target).then(() => flash('Path copied'), () => flash('Could not copy the path'));
  }
  /** Every file of this folder (not its subfolders) in one zip, fetched and packed in the browser. */
  async function downloadAll() {
    if (!baseUrl || zipping) return;
    const names = visible.filter((e) => e.kind === 'file').map((e) => e.name);
    if (!names.length) return;
    setZipping(true);
    try {
      const files: Record<string, Uint8Array> = {};
      let done = 0;
      // A few at a time: fast enough, and the machine serving the files isn't flooded.
      const queue = [...names];
      await Promise.all(Array.from({length: Math.min(4, queue.length)}, async () => {
        for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
          const response = await fetch(assetUrl(baseUrl, name));
          if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
          files[name] = new Uint8Array(await response.arrayBuffer());
          setNotice(`Packing ${++done} of ${names.length}…`);
        }
      }));
      // Stored, not deflated: photos and videos don't shrink, and storing is instant.
      const blob = new Blob([zipSync(files, {level: 0})], {type: 'application/zip'});
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `${path.split('/').filter(Boolean).pop() || 'folder'}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
      flash(`Downloaded ${names.length} files`);
    } catch (e) {
      setNotice(`Could not pack the folder: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setZipping(false);
    }
  }
  function setMode(next: 'grid' | 'list') { setView(next); localStorage.setItem(VIEW_KEY, next); }

  if (!initial) return <p className="p-4 text-sm text-muted-foreground">No folder selected.</p>;
  if (!hostId) return <p role="alert" className="break-words p-4 text-sm text-destructive">{notice || 'Folder not found'}</p>;

  const actions = (entry: Entry) => {
    const target = joinPath(path, entry.name);
    const link = entry.kind === 'file' ? url(entry.name) : null;
    return (
      <div className="flex shrink-0 items-center gap-0.5">
        {link ? <Button size="sm" variant="ghost" className="size-6 p-0" aria-label={`Download ${entry.name}`} onClick={(e) => { e.stopPropagation(); void download(link, entry.name); }}><Icon name="Download" className="size-3.5"/></Button> : null}
        <Button size="sm" variant="ghost" className="size-6 p-0" aria-label={`Add to chat: ${target}`} onClick={(e) => { e.stopPropagation(); addToChat(target); }}><ExplorerIcon name="plus" className="size-3.5"/></Button>
        <Button size="sm" variant="ghost" className="size-6 p-0" aria-label={`Copy path ${target}`} onClick={(e) => { e.stopPropagation(); copyPath(target); }}><Icon name="Copy" className="size-3.5"/></Button>
      </div>
    );
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col" aria-label="Folder">
      <div className="shrink-0 space-y-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1">
          <ExplorerIcon name={hostId.startsWith('remote_') ? 'globe' : 'server'} className="size-4 text-muted-foreground"/>
          <span className="truncate text-xs text-muted-foreground">{machine}</span>
          <div className="ml-auto flex items-center gap-0.5">
            <Button size="sm" variant="ghost" className="size-7 p-0" aria-label="Parent folder" disabled={path === '/'} onClick={() => setPath(path.replace(/\/[^/]+\/?$/, '') || '/')}><Icon name="ArrowUp" className="size-4"/></Button>
            <Button size="sm" variant="ghost" className="size-7 p-0" aria-label="Refresh" onClick={() => void load()}><ExplorerIcon name="refresh" className={`size-4 ${busy ? 'animate-spin' : ''}`}/></Button>
            <Button size="sm" variant={view === 'grid' ? 'secondary' : 'ghost'} className="size-7 p-0" aria-label="Icons" aria-pressed={view === 'grid'} onClick={() => setMode('grid')}><Icon name="GridView" className="size-4"/></Button>
            <Button size="sm" variant={view === 'list' ? 'secondary' : 'ghost'} className="size-7 p-0" aria-label="List" aria-pressed={view === 'list'} onClick={() => setMode('list')}><Icon name="ListView" className="size-4"/></Button>
            <Button size="sm" variant="ghost" className="size-7 p-0" aria-label="Download all files as a zip" disabled={!baseUrl || zipping || !visible.some((e) => e.kind === 'file')} onClick={() => void downloadAll()}><Icon name={zipping ? 'Spinner' : 'Download'} className={`size-4 ${zipping ? 'animate-spin' : ''}`}/></Button>
            <Button size="sm" variant="ghost" className="size-7 p-0" aria-label={`Add folder to chat: ${path}`} onClick={() => addToChat(path)}><ExplorerIcon name="plus" className="size-4"/></Button>
          </div>
        </div>
        <nav aria-label="Path" className="flex flex-wrap items-center gap-0.5 text-sm">
          {crumbs(path).map((crumb, index, all) => (
            <React.Fragment key={crumb.path}>
              {index > 1 ? <span className="text-muted-foreground">/</span> : null}
              <button type="button" className={`max-w-[14rem] truncate rounded px-1 hover:bg-state-hover ${index === all.length - 1 ? 'font-medium' : 'text-muted-foreground'}`} onClick={() => setPath(crumb.path)}>{crumb.name}</button>
            </React.Fragment>
          ))}
        </nav>
      </div>

      {notice ? <p role="status" className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground">{notice}</p> : null}
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {error ? <div className="space-y-2 p-2"><p role="alert" className="break-words text-sm text-destructive">{error}</p><Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button></div> : null}
        {entries === null && !error ? <p className="p-2 text-sm text-muted-foreground">Loading…</p> : null}
        {entries !== null && visible.length === 0 ? <p className="p-2 text-sm text-muted-foreground">This folder is empty</p> : null}
        {view === 'grid' ? (
          <div className="grid gap-2" style={{gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))'}}>
            {visible.map((entry) => {
              const kind = entry.kind === 'file' ? fileKind(entry.name) : null;
              const src = kind === 'image' ? url(entry.name) : null;
              return (
                <div key={entry.name} role="button" tabIndex={0} title={entry.name}
                  className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-background text-left outline-none hover:bg-state-hover focus-visible:ring-1 focus-visible:ring-ring"
                  onClick={() => open(entry)} onKeyDown={(e) => { if (e.key === 'Enter') open(entry); }}>
                  <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted/40">
                    {src ? <img src={src} alt="" loading="lazy" className="size-full object-cover"/> : (
                      <div className="flex flex-col items-center gap-1 text-muted-foreground">
                        <ExplorerIcon name={entry.kind === 'directory' ? 'folder' : fileIcon(entry.name)} className="size-8"/>
                        {entry.kind === 'file' ? <span className="text-[10px] font-medium uppercase">{entry.name.split('.').pop()}</span> : null}
                      </div>
                    )}
                  </div>
                  <div className="flex min-w-0 items-center gap-1 px-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-xs">{entry.name}</span>
                  </div>
                  <div className="absolute right-1 top-1 rounded-md border border-border bg-background text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(pointer:coarse)]:opacity-100">{actions(entry)}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col">
            {visible.map((entry) => (
              <div key={entry.name} role="button" tabIndex={0} title={entry.name}
                className="group flex h-8 min-w-0 items-center gap-2 rounded-md px-1.5 hover:bg-state-hover focus-visible:ring-1 focus-visible:ring-ring"
                onClick={() => open(entry)} onKeyDown={(e) => { if (e.key === 'Enter') open(entry); }}>
                <ExplorerIcon name={entry.kind === 'directory' ? 'folder' : fileIcon(entry.name)} className="size-4 text-muted-foreground"/>
                <span className="min-w-0 flex-1 truncate text-sm">{entry.name}</span>
                <div className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(pointer:coarse)]:opacity-100">{actions(entry)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {viewer && baseUrl ? (
        <MediaViewer
          names={media}
          name={viewer}
          folder={path.split('/').filter(Boolean).pop() || '/'}
          baseUrl={baseUrl}
          onChange={setViewer}
          onClose={() => setViewer(null)}
          onOpen={(name) => { setViewer(null); void openDocument(name); }}
        />
      ) : null}
    </div>
  );
}

function MediaViewer({names, name, folder, baseUrl, onChange, onClose, onOpen}: {names: string[]; name: string; folder: string; baseUrl: string; onChange: (name: string) => void; onClose: () => void; onOpen: (name: string) => void}) {
  const index = names.indexOf(name);
  const step = (delta: number) => { if (names.length > 1) onChange(names[(index + delta + names.length) % names.length]); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const src = assetUrl(baseUrl, name);
  const kind = fileKind(name);
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-background" role="dialog" aria-label={name}>
      <div className="flex items-center gap-1 border-b border-border px-2 py-2">
        <span title="Back to the folder (Esc)" className="flex min-w-0 max-w-[40%] shrink-0">
          <Button size="sm" variant="ghost" className="h-7 min-w-0 gap-1 px-1.5" aria-label={`Back to the folder ${folder}`} onClick={onClose}>
            <Icon name="ChevronLeft" className="size-4 shrink-0"/><span className="truncate text-sm">{folder}</span>
          </Button>
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
        {names.length > 1 ? <span className="text-xs text-muted-foreground">{index + 1} / {names.length}</span> : null}
        <Button size="sm" variant="ghost" className="size-7 p-0" aria-label="Previous" disabled={names.length < 2} onClick={() => step(-1)}><Icon name="ChevronLeft" className="size-4"/></Button>
        <Button size="sm" variant="ghost" className="size-7 p-0" aria-label="Next" disabled={names.length < 2} onClick={() => step(1)}><Icon name="ChevronRight" className="size-4"/></Button>
        <Button size="sm" variant="ghost" className="size-7 p-0" aria-label={`Download ${name}`} onClick={() => void download(src, name)}><Icon name="Download" className="size-4"/></Button>
        <Button size="sm" variant="ghost" className="size-7 p-0" aria-label="Open in a tab" onClick={() => onOpen(name)}><Icon name="ExternalLink" className="size-4"/></Button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/30 p-3">
        {kind === 'image' ? <img src={src} alt={name} className="max-h-full max-w-full rounded-md object-contain shadow-sm"/> : null}
        {kind === 'pdf' ? <iframe src={src} title={name} className="size-full rounded-md border border-border bg-white"/> : null}
        {kind === 'video' ? <video src={src} controls className="max-h-full max-w-full rounded-md"/> : null}
        {kind === 'audio' ? <audio src={src} controls className="w-full max-w-md"/> : null}
      </div>
    </div>
  );
}
