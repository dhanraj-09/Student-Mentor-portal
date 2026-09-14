#!/usr/bin/env node
/* eslint-disable no-console -- operator facing CLI */
/**
 * Stages the MediaPipe segmentation assets that background blur needs.
 *
 * @livekit/track-processors fetches its WebAssembly runtime from jsdelivr and
 * its model from Google storage at call time. That makes a feature in the
 * middle of a live call depend on a third party being reachable from every
 * participant's browser — on a phone hotspot that is a real risk. Copying the
 * runtime out of node_modules and downloading the model once means the assets
 * are served from this app's own origin instead.
 *
 *   node scripts/mediapipe-assets.mjs
 *
 * The output is git-ignored (19MB of WebAssembly does not belong in a repo);
 * rerun it after a fresh `npm install`.
 */
import { createWriteStream } from 'node:fs';
import { cp, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSource = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const outDir = join(root, 'packages/frontend/public/mediapipe');
const wasmOut = join(outDir, 'wasm');
const modelOut = join(outDir, 'selfie_segmenter.tflite');

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(wasmSource))) {
    console.error('Missing @mediapipe/tasks-vision. Run `npm install` first.');
    process.exit(1);
  }

  await mkdir(outDir, { recursive: true });

  console.log('Copying MediaPipe WebAssembly runtime...');
  await cp(wasmSource, wasmOut, { recursive: true });

  if (await exists(modelOut)) {
    console.log('Segmentation model already present.');
  } else {
    console.log('Downloading the selfie segmentation model...');
    const response = await fetch(MODEL_URL);
    if (!response.ok || response.body === null) {
      console.error(`Model download failed: HTTP ${response.status}`);
      process.exit(1);
    }
    await pipeline(
      Readable.fromWeb(response.body),
      createWriteStream(modelOut)
    );
  }

  console.log(`Ready. Assets served from /mediapipe by the dev server.`);
}

main().catch((error) => {
  console.error('Could not stage MediaPipe assets:', error.message);
  process.exit(1);
});
