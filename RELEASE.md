# Release preparation

The plugin uses the public Plugin SDK and requires no BB core patches.

Before submitting an update to the Community marketplace:

1. Run `npm ci`, `npm run typecheck`, `npm test`, `npm run test:ui` and `npm run build` on the supported BB version.
2. Verify a real macOS → Linux transfer and a remote CLI read, SHA-256 integrity, access denial outside allowed roots, cancellation and host disconnection.
3. Verify the public repository URL and author in package.json. Do not include local access settings, host IDs, test files or private project documentation.
4. Publish the source, LICENSE, README, PLUGIN_OVERVIEW and a version tag. Verify a clean Git installation through BB: it installs runtime dependencies only, so the build must work without development dependencies.
5. Prepare the marketplace entry using the current submit-a-plugin instructions. Submission and acceptance are separate steps; a local installation is not publication.

Potential future improvements: resumable large transfers, retention-based import cleanup, search, SFTP key authentication and additional interface languages. Untrusted local directories require platform-specific atomic path checks; portable Node filesystem checks do not provide an OS sandbox.
