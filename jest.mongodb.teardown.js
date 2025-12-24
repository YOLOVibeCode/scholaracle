const fs = require('fs');
const path = require('path');

module.exports = async () => {
  try {
    const statePath = path.join(__dirname, '.jest-mongodb.json');
    if (!fs.existsSync(statePath)) return;
    const { pid } = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (pid) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch (e) {
        // ignore
      }
    }
    fs.unlinkSync(statePath);
  } catch (e) {
    // ignore teardown failures
  }
};


