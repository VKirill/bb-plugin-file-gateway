# File Gateway

Read and transfer files between enrolled BB machines using BB's existing private host RPC connection. No SSH setup, public HTTP server, or additional daemon installation is required.

Status: **0.1.0-beta.1**, macOS/Linux. BB >=0.43, Plugin SDK >=0.4.87. Uses experimental public host RPC APIs.

## Install and configure

```sh
npm ci
bb plugin build
bb plugin install . --yes
```

In Settings → File Gateway set **Shared folders by host**:

```json
{
  "host_source": { "roots": ["/home/me/Documents"], "deny": ["/home/me/Documents/private"] },
  "host_destination": { "roots": [], "deny": [] }
}
```

The default `{}` shares nothing. Host IDs come from `bb machine list --json`.
Roots and exclusions are per host, with absolute paths. Settings apply on the next call; a settings change also cancels an active copy between chunks. Root configuration belongs to the operator, not tool arguments. Destination hosts must be explicitly enabled even if they expose no source roots.

## Use

```sh
bb file-gateway hosts
bb file-gateway list host_source /home/me/Documents
bb file-gateway read host_source /home/me/Documents/report.md
bb file-gateway copy host_source /home/me/Documents/report.pdf host_destination
```

The native `bb_file_gateway` tool has the same operations. Copies return destination machine, absolute local path, size, modification time and SHA-256. Native tools appear when the provider session is next constructed; use the CLI immediately after installation.

Copies land in `<plugin-host-dataDir>/imports/<uuid>-<filename>` on the receiving machine, with mode 0600. Files remain available for local analysis. Existing files are never overwritten. Use your local filesystem tools to move or delete completed imports.

## Limits and access model

- 256 MiB per file, adjustable downward. 512 KiB chunks, two concurrent server copies, eight sessions per host worker. Text output: up to 128 KiB; directory pages: up to 200 entries through the tool, 100 through CLI.
- Source files must be regular files with one hard link. Symlink components are rejected. Directories are listed one level at a time; pagination assumes an unchanged directory. No recursive search or directory copy in this release.
- Common credential paths, `.env*`, key/session files, BB/provider state and browser stores are excluded by name. This is **not secret-content detection**. Scope roots narrowly and add explicit exclusions for other sensitive locations.
- Access inherits the trust of your BB server, enrolled machines and installed plugins. It is not an OS sandbox or a per-project isolation boundary. Authorized BB CLI users can change plugin settings. Do not share directories controlled by hostile local writers: Node's portable path checks cannot provide an atomic open-beneath guarantee against concurrent ancestor replacement.
- Windows is not supported. Mac aliases such as `/tmp` may be symlinks; use the canonical path (for example `/private/tmp`). A missing/offline machine fails clearly, with no fallback to a different host.
- SHA-256 verifies transmitted bytes. Source size/mtime checks detect normal concurrent edits, not adversarial changes preserving metadata. Transfers are not resumable.
- Cancellation, idle expiry (two minutes), and graceful disposal close handles and remove partial files. A killed daemon can leave `.partial` files. Completed imports persist; monitor disk usage and remove unused files locally. Full disk/write failures abort the transfer.
- No public routes, arbitrary remote write/delete, or file contents in logs. Logs contain host IDs and byte counts only. File text may appear in the requesting agent conversation when explicitly read.

## Development and release

```sh
npm ci
npm run typecheck
npm test
npm run build
```

Tests use the public SDK backend and host harnesses and real temporary files. They cover policy, symlinks/hard links, pagination, transfer integrity, cancellation, invalid chunks, lifecycle cleanup, source edits, empty/binary files, agent/CLI routing, settings and offline hosts.

Source layout: `server.ts` — settings/CLI/tool and relay; `host.ts` — host-local file operations; `policy.ts` — containment and exclusions; `contract.ts` — validated host contract. Runtime dependency: Zod. BB deploys the host bundle lazily and verifies it.

See `PLUGIN_OVERVIEW.md` for marketplace copy and `RELEASE.md` for publication steps. The beta is not published by this repository alone.

## Rollback

Disable with `bb plugin disable file-gateway` or set shares to `{}` to revoke all access. Disable disposes active host workers through BB lifecycle. Re-enable/reinstall the previous tag to roll back a future update. Disabling does not delete completed imports. No core BB patches are required.

Conversation supporting files under `.bb/chats/thr_*/artifacts`, `notes` and `tmp` may be shared when inside an allowed root. BB databases, exported history, credentials and session stores remain excluded. Individual sensitive filenames are still excluded inside these folders.
