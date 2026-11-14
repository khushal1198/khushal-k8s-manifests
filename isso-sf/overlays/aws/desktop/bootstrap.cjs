// Runs only in the init container, before the database's web server starts.
// Credentials stay in Kubernetes Secret environment variables, never OS argv.
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const data = '/opt/meshcentral/meshcentral-data';
const entry = '/opt/meshcentral/meshcentral/meshcentral.js';
const marker = `${data}/.isso-owner-bootstrapped`;
fs.mkdirSync(data, { recursive: true });
const config = JSON.parse(fs.readFileSync('/config/config.json', 'utf8'));
const sessionKey = process.env.MESH_SESSION_KEY;
if (!sessionKey || sessionKey.length < 64) throw Error('Session key missing');
config.settings.sessionKey = sessionKey;
fs.writeFileSync(`${data}/config.json`, JSON.stringify(config), { mode: 0o600 });
fs.chmodSync(`${data}/config.json`, 0o600);
if (fs.existsSync(marker)) {
  console.log('Existing gateway database retained; bootstrap skipped.');
  process.exit(0);
}
if (!process.env.MESH_OWNER_EMAIL || !process.env.MESH_OWNER_PASSWORD ||
    process.env.MESH_OWNER_PASSWORD.length < 24) throw Error('Bootstrap secret missing');
const child = `
  process.argv = [process.execPath, ${JSON.stringify(entry)},
    '--datapath', ${JSON.stringify(data)}];
  const email = process.env.MESH_OWNER_EMAIL;
  if (process.env.MESH_BOOTSTRAP_STEP === 'create') {
    process.argv.push('--createaccount', email, '--pass', process.env.MESH_OWNER_PASSWORD,
      '--email', email, '--name', 'Mandir Owner');
  } else { process.argv.push('--adminaccount', email); }
  require(${JSON.stringify(entry)}).mainStart();
`;
for (const step of ['create', 'admin']) {
  const result = spawnSync(process.execPath, ['-e', child], {
    env: { ...process.env, MESH_BOOTSTRAP_STEP: step },
    encoding: 'utf8', timeout: 180000, maxBuffer: 1024 * 1024
  });
  const accepted = /(^|\n)Done\./.test(result.stdout || '') ||
    (step === 'create' && /User already exists\./.test(result.stdout || ''));
  if (result.error || result.status !== 0 || !accepted) {
    // Do not forward unreviewed CLI output, which may include private config.
    throw Error(`Gateway ${step} step failed; no public server started`);
  }
  console.log(`Gateway owner ${step} step complete.`);
}
fs.writeFileSync(marker, 'Bootstrapped; do not delete or reset the database.\n', { mode: 0o600 });
