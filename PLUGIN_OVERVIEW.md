## Your files, across your BB machines

Working on a server while your document is on a Mac? File Gateway lets your agent list a shared folder, read text, or copy a file to another enrolled machine without setting up SSH or publishing a download link.

## What it provides

- An agent tool and `bb file-gateway` commands to discover machines, browse folders, read text and transfer files.
- Private transfers over BB's existing host connection, with chunked delivery and SHA-256 verification.
- Per-machine shared folders and exclusions, editable in plugin settings.
- Unique destination files: existing files are never overwritten.

Nothing is shared until you configure it. Common credential paths and symbolic links are excluded. Choose trusted folders; exclusions do not scan file contents for secrets.

## Beta limits

Requires BB 0.43 or newer and Plugin SDK 0.4.87 or newer. Supports macOS and Linux, files up to 256 MiB, and single-file transfers. No Windows support, recursive folder copies, resumable transfers or arbitrary remote editing yet. Copies persist in the receiving machine's plugin imports folder until you remove them locally.
