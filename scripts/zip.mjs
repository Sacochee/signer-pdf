// Builds dist/signer-pdf-<version>.zip from the committed extension/ folder
// (manifest at the root of the zip, as the Chrome Web Store expects).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'extension', 'manifest.json'), 'utf8'));
const out = join('dist', `signer-pdf-${version}.zip`);
mkdirSync(join(root, 'dist'), { recursive: true });
execFileSync('git', ['archive', '--format=zip', '-o', out, 'HEAD:extension'], { cwd: root, stdio: 'inherit' });
console.log(out);
