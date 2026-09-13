# File Gateway

Read and transfer files between enrolled BB machines using BB's existing private host RPC connection. No SSH setup, public HTTP server, or additional daemon installation is required.

Status: **0.1.0-beta.4**, macOS/Linux. BB >=0.43, Plugin SDK >=0.4.87. Uses experimental public host RPC APIs.

## Install and configure

```sh
bb plugin install git:https://github.com/VKirill/bb-plugin-file-gateway.git@v0.1.0-beta.4 --yes
```

Open **Settings → File Gateway → Доступ к файлам**. Each enrolled machine has its own card and three modes:

- **Выключено (Off)** — no source access or incoming copies through the gateway.
- **Выбранные папки (Selected folders)** — select directories using the remote folder browser, or enter paths under advanced settings. Exclusions and automatic sensitive-path filters apply.
- **Всё доступно (Full computer)** — all ordinary files the BB daemon user can read, including hidden files, credentials and application settings. Ignores roots, exclusions and sensitive-name filters, follows symlinks and permits hard links. Does not grant root/admin privileges or bypass macOS permissions. Still provides file reading/copying, not arbitrary remote editing or command execution.

Changes save immediately; folder selections survive switching modes. New machines start disabled. Folder browsing targets the selected machine, including from the remote web client. Offline machines can be configured by entering absolute paths. The transfer size setting is under **Передача файлов**.

Settings are stored in plugin KV `config-v2`, with revision checks to prevent stale browser tabs overwriting newer edits. New installs start with all machines disabled. Raw JSON is not displayed in the settings page.

## File tree and chat references

In a chat or on the New thread screen, open the right panel, choose a new tab, then **Файлы подключений**. Expand a machine or website and its folders. The **＋** button inserts a native mention for a file or directory while preserving your draft. When sent, the mention resolves to its exact source ID and absolute path; no file content or connection password is embedded. The agent reads the referenced file only when needed. Revoked references fail visibly.

## Website connections

Open **Settings → File Gateway → FTP и SFTP → Добавить подключение**. Enter a name, protocol, address, port, username, password and accessible root. Save, then use **Проверить**. FTPS uses explicit TLS with certificate verification. SFTP requires a SHA-256 server host-key fingerprint (64 hexadecimal characters) and supports password authentication in this beta. Plain FTP is available for legacy accounts and sends credentials and data without encryption.

Connections originate from the BB server machine, which must reach the website. They appear in the same tree and `hosts` output with IDs `remote_<uuid>`. These IDs work as source `hostId` values in `list`, `read` and `copy`; destinations must be enrolled BB machines. A saved enabled connection is not a live availability check. Passwords use BB secret settings (0600 server files), never the connection KV record, frontend read responses or agent context. The native generic secret field is the internal vault; manage passwords through the connection form.

Remote operations are read-only: no site uploads, editing or deletion. Limit: 32 MiB per external file, at most two downloads, 60-second operation deadline. Files are buffered within that limit before being copied or read. Remote read may download the complete file even when returning a text slice. FTP/FTPS reject descendant symlinks; SFTP resolves canonical paths inside the configured root. The external server and account permissions remain the authoritative boundary. Listings are paginated in the UI after the server returns them. No SSH private-key authentication or implicit FTPS in this release.

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
- Source files must be regular files. Selected-folders mode rejects multiple hard links and symlink components; Full computer mode permits both. Directories are listed one level at a time; pagination assumes an unchanged directory. No recursive search or directory copy in this release.
- In selected-folders mode common credential paths, `.env*`, key/session files, BB/provider state and browser stores are excluded by name. Full computer mode disables these exclusions. This is **not secret-content detection**. Scope roots narrowly and add explicit exclusions for other sensitive locations.
- Access inherits the trust of your BB server, enrolled machines and installed plugins. It is not an OS sandbox or a per-project isolation boundary. Authorized BB CLI users can change plugin settings. Do not share directories controlled by hostile local writers: Node's portable path checks cannot provide an atomic open-beneath guarantee against concurrent ancestor replacement.
- Windows is not supported. In selected-folders mode Mac aliases such as `/tmp` may be symlinks; use the canonical path (for example `/private/tmp`). Full computer mode resolves these aliases. A missing/offline machine fails clearly, with no fallback to a different host.
- SHA-256 verifies transmitted bytes. Source size/mtime checks detect normal concurrent edits, not adversarial changes preserving metadata. Transfers are not resumable.
- Cancellation, idle expiry (two minutes), and graceful disposal close handles and remove partial files. A killed daemon can leave `.partial` files. Completed imports persist; monitor disk usage and remove unused files locally. Full disk/write failures abort the transfer.
- No public routes, arbitrary remote write/delete, or file contents in logs. Logs contain host IDs and byte counts only. File text may appear in the requesting agent conversation when explicitly read.

## Development and release

```sh
npm ci
npm run typecheck
npm test
npm run test:ui
npm run build
```

Tests use the public SDK backend and host harnesses and real temporary files. They cover policy, symlinks/hard links, pagination, transfer integrity, cancellation, invalid chunks, lifecycle cleanup, source edits, empty/binary files, agent/CLI routing, settings and offline hosts.

Source layout: `app.tsx` — native settings section with vendored BB controls; `configuration.ts` — validated settings RPC; `server.ts` — settings/CLI/tool and relay; `host.ts` — host-local file operations; `policy.ts` — containment and exclusions; `contract.ts` — validated host contract. Runtime dependencies include Zod, basic-ftp and ssh2-sftp-client. SSH is loaded through Node from installed dependencies to keep optional native probes outside the BB bundler; managed source installations must retain node_modules. The repository .npmrc disables dependency install scripts; the SSH JavaScript implementation remains functional. BB deploys the host bundle lazily and verifies it.

See `PLUGIN_OVERVIEW.md` for marketplace copy and `RELEASE.md` for publication steps. The GitHub release and Community marketplace review are separate.

## Rollback

Disable with `bb plugin disable file-gateway` or choose Выключено for each machine in Settings. Disable disposes active host workers through BB lifecycle. Re-enable/reinstall the previous tag to roll back a future update. Disabling does not delete completed imports. No core BB patches are required.

Conversation supporting files under `.bb/chats/thr_*/artifacts`, `notes` and `tmp` may be shared when inside an allowed root. In selected-folders mode BB databases, exported history, credentials and session stores remain excluded. Full computer mode does not apply these filters.

The initial settings UI uses Russian labels; this README explains their English equivalents.
