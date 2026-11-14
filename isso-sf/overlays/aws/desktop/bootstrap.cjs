// Runs only in the init container, before the database's web server starts.
// Credentials stay in Kubernetes Secret environment variables, never OS argv.
const fs = require('node:fs');
const { spawn } = require('node:child_process');
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
    '--datapath', ${JSON.stringify(data)}, '--launch', '1'];
  // Calling mainStart from node -e must bypass its process supervisor. Otherwise
  // the inherited -e execArgv would run this wrapper again in every child.
  process.execArgv = [];
  const email = process.env.MESH_OWNER_EMAIL;
  if (process.env.MESH_BOOTSTRAP_STEP === 'create') {
    process.argv.push('--createaccount', email, '--pass', process.env.MESH_OWNER_PASSWORD,
      '--email', email, '--name', 'Mandir Owner');
  } else { process.argv.push('--adminaccount', email); }
  require(${JSON.stringify(entry)}).mainStart();
`;
function runStep(step) {
  return new Promise((resolve, reject) => {
    // MeshCentral's --launch mode exits when its parent closes stdin. Keep this
    // pipe open until the CLI finishes its DB operation; spawnSync closes it early.
    const proc = spawn(process.execPath, ['-e', child], {
      env: { ...process.env, MESH_BOOTSTRAP_STEP: step },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => proc.kill('SIGKILL'), 180000);
    const collect = (chunk, isError) => {
      if (isError) stderr += chunk; else stdout += chunk;
      if (stdout.length + stderr.length > 1024 * 1024) proc.kill('SIGKILL');
    };
    proc.stdout.on('data', chunk => collect(chunk, false));
    proc.stderr.on('data', chunk => collect(chunk, true));
    proc.stdin.on('error', () => {});
    proc.on('error', error => { clearTimeout(timer); reject(error); });
    proc.on('close', (status, signal) => {
      clearTimeout(timer);
      resolve({stdout, stderr, status, signal});
    });
  });
}
async function bootstrap() {
for (const step of ['create', 'admin']) {
  const result = await runStep(step);
  const accepted = /(^|\n)Done\./.test(result.stdout || '') ||
    (step === 'create' && /User already exists\./.test(result.stdout || ''));
  if (result.error || result.status !== 0 || !accepted) {
    // Emit only diagnostic lines and redact credentials before logging.
    const diagnostics = `${result.stdout || ''}\n${result.stderr || ''}`
      .replaceAll(process.env.MESH_OWNER_PASSWORD, '[redacted]')
      .replaceAll(sessionKey, '[redacted]')
      .slice(-2000);
    console.error(`Bootstrap status=${result.status}, signal=${result.signal}; ${diagnostics}`);
    throw Error(`Gateway ${step} step failed; no public server started`);
  }
  console.log(`Gateway owner ${step} step complete.`);
}
fs.writeFileSync(marker, 'Bootstrapped; do not delete or reset the database.\n', { mode: 0o600 });
}
bootstrap().catch(error => { console.error(error.message); process.exitCode = 1; });
