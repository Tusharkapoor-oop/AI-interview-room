const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Runner script started');
console.log('Current directory:', process.cwd());

const logFile = path.join(__dirname, 'runner.log');
const out = fs.openSync(logFile, 'a');

// Test running python
const child = spawn('python', ['--version'], {
  detached: true,
  stdio: ['ignore', out, out]
});

child.on('error', (err) => {
  fs.appendFileSync(logFile, `Error: ${err.message}\n`);
});

child.on('exit', (code) => {
  fs.appendFileSync(logFile, `Exit code: ${code}\n`);
});
