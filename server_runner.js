const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

const backendDir = path.join(__dirname, 'backend-cv');
const frontendDir = path.join(__dirname, 'frontend');

// Helper to clear and open logs
fs.writeFileSync(path.join(__dirname, 'backend.log'), '');
fs.writeFileSync(path.join(__dirname, 'frontend.log'), '');
const backendLog = fs.openSync(path.join(__dirname, 'backend.log'), 'a');
const frontendLog = fs.openSync(path.join(__dirname, 'frontend.log'), 'a');

console.log('Spawning backend...');
const backendProcess = spawn('python -u -m uvicorn main:app --host 0.0.0.0 --port 8000', {
  cwd: backendDir,
  shell: true,
  env: { ...process.env, PYTHONUNBUFFERED: '1' },
  stdio: ['ignore', backendLog, backendLog]
});

console.log('Spawning frontend...');
const frontendProcess = spawn('npm run dev', {
  cwd: frontendDir,
  shell: true,
  stdio: ['ignore', frontendLog, frontendLog]
});

console.log(`Backend PID: ${backendProcess.pid}`);
console.log(`Frontend PID: ${frontendProcess.pid}`);

// Check port utility
function checkPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.on('connect', () => {
      socket.destroy();
      resolve('OPEN');
    });
    socket.on('error', () => {
      resolve('CLOSED');
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve('CLOSED');
    });
    socket.connect(port, '127.0.0.1');
  });
}

// Write status periodic task
setInterval(async () => {
  const backendStatus = await checkPort(8000);
  const frontendStatus = await checkPort(5173);
  
  const status = {
    timestamp: new Date().toISOString(),
    backend: {
      status: backendStatus,
      pid: backendProcess.pid
    },
    frontend: {
      status: frontendStatus,
      pid: frontendProcess.pid
    }
  };
  
  fs.writeFileSync(path.join(__dirname, 'runner_status.json'), JSON.stringify(status, null, 2));
}, 2000);

// Graceful shutdown
function cleanup() {
  console.log('Cleaning up processes...');
  try {
    // Kill processes
    if (process.platform === 'win32') {
      // Use taskkill to kill the whole process tree spawned by the shell
      spawn('taskkill', ['/F', '/T', '/PID', backendProcess.pid], { shell: true });
      spawn('taskkill', ['/F', '/T', '/PID', frontendProcess.pid], { shell: true });
    } else {
      backendProcess.kill();
      frontendProcess.kill();
    }
  } catch (e) {
    console.error('Error killing processes:', e);
  }
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);
