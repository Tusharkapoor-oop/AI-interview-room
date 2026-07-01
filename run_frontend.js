const { spawn } = require('child_process');
const path = require('path');

const frontendDir = path.join(__dirname, 'frontend');
console.log('Spawning frontend as single string...');
const child = spawn('npm run dev', {
  cwd: frontendDir,
  shell: true
});

let stdout = '';
let stderr = '';

child.stdout.on('data', (data) => {
  stdout += data.toString();
});

child.stderr.on('data', (data) => {
  stderr += data.toString();
});

child.on('error', (err) => {
  console.log('Process error:', err);
});

child.on('exit', (code, signal) => {
  console.log(`Process exited with code ${code} and signal ${signal}`);
});

setTimeout(() => {
  console.log('--- STDOUT ---');
  console.log(stdout || '(empty)');
  console.log('--- STDERR ---');
  console.log(stderr || '(empty)');
  
  console.log('Killing process...');
  child.kill();
  process.exit(0);
}, 6000);
