const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { listPackage, extractFile } = require('@electron/asar');

const root = path.resolve(__dirname, '..');
const release = path.join(root, 'release');
const unpacked = path.join(release, 'win-unpacked');
const appArchive = path.join(unpacked, 'resources', 'app.asar');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function matchingFiles(pattern) {
  const regex = new RegExp(pattern);
  return fs.readdirSync(release).filter(name => regex.test(name));
}

async function hashFile(filename) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function verify() {
  assert(fs.existsSync(appArchive), 'Windows app.asar was not produced.');
  const files = new Set(listPackage(appArchive));
  const required = [
    '/electron/main.cjs',
    '/electron/preload.cjs',
    '/electron/store.cjs',
    '/electron/model.cjs',
    '/electron/prompt.cjs',
    '/electron/settings.cjs',    '/LICENSE',
    '/THIRD_PARTY_NOTICES.md',
    '/licenses/DM-Sans-OFL.txt',
    '/licenses/Newsreader-OFL.txt',
    '/licenses/Lucide-ISC.txt',

    '/dist/index.html'
  ];
  for (const name of required) assert(files.has(name), `Missing ${name} in app.asar.`);
  assert([...files].some(name => name.startsWith('/dist/assets/index-') && name.endsWith('.js')), 'Renderer JavaScript is missing from app.asar.');
  const packedPackage = JSON.parse(extractFile(appArchive, 'package.json').toString('utf8'));
  assert(packedPackage.main === 'electron/main.cjs', 'Packaged Electron entry point is incorrect.');
  assert(packedPackage.version === packageJson.version, 'Packaged version does not match package.json.');
  assert(fs.statSync(path.join(unpacked, 'LICENSE.electron.txt')).size > 0, 'Electron license notice is missing.');
  assert(fs.statSync(path.join(unpacked, 'LICENSES.chromium.html')).size > 0, 'Chromium license notice is missing.');

  const artifacts = [...matchingFiles(/-安装版\.exe$/), ...matchingFiles(/-便携版\.exe$/)];
  assert(artifacts.length === 2, 'Expected one Windows installer and one portable app.');
  for (const name of artifacts) {
    const filename = path.join(release, name);
    const file = fs.openSync(filename, 'r');
    const signature = Buffer.alloc(2);
    fs.readSync(file, signature, 0, 2, 0);
    fs.closeSync(file);
    assert(signature.toString('ascii') === 'MZ', `${name} is not a Windows executable.`);
    assert(fs.statSync(filename).size > 50_000_000, `${name} is unexpectedly small.`);
    console.log(`${name}\t${fs.statSync(filename).size} bytes\tSHA-256 ${await hashFile(filename)}`);
  }
  console.log(`app.asar verified: ${required.length + 2} required entries, version ${packageJson.version}.`);
}

verify().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
