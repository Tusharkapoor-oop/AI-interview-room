const net = require('net');

function checkPort(port, name) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on('connect', () => {
      console.log(`Port ${port} (${name}) is OPEN`);
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      console.log(`Port ${port} (${name}) is CLOSED`);
      resolve(false);
    });
    socket.on('timeout', () => {
      console.log(`Port ${port} (${name}) TIMEOUT`);
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}

async function run() {
  await checkPort(8000, 'Backend');
  await checkPort(5173, 'Frontend');
}

run();
