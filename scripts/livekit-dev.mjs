#!/usr/bin/env node
/* eslint-disable no-console -- operator facing CLI */
/**
 * Downloads (once) and runs the LiveKit SFU in dev mode for local development.
 *
 * Dev mode listens on ws://localhost:7880 with API key `devkey` and secret
 * `secret` - well known credentials that are only ever valid on localhost.
 * `npm run setup` writes those same values into packages/backend/.env.
 *
 * For anything beyond a laptop use docker-compose or LiveKit Cloud; see the
 * README.
 */
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const installDir = join(root, '.livekit');

const VERSION = process.env.LIVEKIT_VERSION ?? '1.13.5';

const PLATFORMS = {
  'win32-x64': {
    asset: `livekit_${VERSION}_windows_amd64.zip`,
    binary: 'livekit-server.exe',
  },
  'win32-arm64': {
    asset: `livekit_${VERSION}_windows_arm64.zip`,
    binary: 'livekit-server.exe',
  },
  'darwin-x64': {
    asset: `livekit_${VERSION}_darwin_amd64.zip`,
    binary: 'livekit-server',
  },
  'darwin-arm64': {
    asset: `livekit_${VERSION}_darwin_arm64.zip`,
    binary: 'livekit-server',
  },
  'linux-x64': {
    asset: `livekit_${VERSION}_linux_amd64.tar.gz`,
    binary: 'livekit-server',
  },
  'linux-arm64': {
    asset: `livekit_${VERSION}_linux_arm64.tar.gz`,
    binary: 'livekit-server',
  },
};

const key = `${process.platform}-${process.arch}`;
const platform = PLATFORMS[key];

if (!platform) {
  console.error(
    `No LiveKit build is published for ${key}.\n` +
      'Install it manually from https://github.com/livekit/livekit/releases, or run\n' +
      '  docker compose up livekit'
  );
  process.exit(1);
}

const binaryPath = join(installDir, platform.binary);

/**
 * Unpacks the release archive.
 *
 * The tools differ per platform: the `tar` on a Windows PATH is often GNU tar
 * (which cannot read zip), so PowerShell is used there instead.
 */
function extractArchive(archivePath) {
  const attempts = archivePath.endsWith('.zip')
    ? process.platform === 'win32'
      ? [
          [
            'powershell',
            [
              '-NoProfile',
              '-Command',
              `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${installDir}' -Force`,
            ],
          ],
        ]
      : [
          ['unzip', ['-o', archivePath, '-d', installDir]],
          ['tar', ['-xf', platform.asset]],
        ]
    : [['tar', ['-xzf', platform.asset]]];

  for (const [command, args] of attempts) {
    const result = spawnSync(command, args, {
      cwd: installDir,
      stdio: 'inherit',
    });
    if (result.status === 0 && existsSync(binaryPath)) return;
  }

  throw new Error(
    `Could not extract ${archivePath}.\n` +
      `Extract it by hand into ${installDir} and run this command again.`
  );
}

async function download() {
  const url = `https://github.com/livekit/livekit/releases/download/v${VERSION}/${platform.asset}`;
  console.log(`Downloading LiveKit ${VERSION} for ${key}`);
  console.log(`  ${url}`);

  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Download failed with HTTP ${response.status}`);
  }

  mkdirSync(installDir, { recursive: true });
  const archivePath = join(installDir, platform.asset);
  writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()));

  extractArchive(archivePath);

  if (process.platform !== 'win32') chmodSync(binaryPath, 0o755);
  console.log(`Installed to ${binaryPath}\n`);
}

async function main() {
  if (!existsSync(binaryPath)) {
    await download();
  }

  console.log('Starting LiveKit in dev mode');
  console.log('  url    : ws://localhost:7880');
  console.log('  api key: devkey');
  console.log(
    '  secret : secret   (localhost only - never use these in production)\n'
  );

  const server = spawn(binaryPath, ['--dev', ...process.argv.slice(2)], {
    stdio: 'inherit',
  });

  const stop = () => server.kill('SIGINT');
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  server.on('exit', (code) => process.exit(code ?? 0));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
