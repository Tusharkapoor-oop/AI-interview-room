const fs = require('fs');
const path = require('path');
try {
  const content = fs.readFileSync(path.join(__dirname, 'frontend.log'), 'utf8');
  console.log(content || '(empty)');
} catch (e) {
  console.log('Error reading log:', e.message);
}
