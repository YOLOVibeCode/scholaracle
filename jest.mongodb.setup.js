const { MongoMemoryServer } = require('mongodb-memory-server');
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  // Spin up an ephemeral MongoDB for jest runs so tests are self-contained.
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  const info = mongod.instanceInfoSync ? mongod.instanceInfoSync() : mongod.instanceInfo;
  const pid = info && info.pid ? info.pid : null;

  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'scholaracle_test';

  const statePath = path.join(__dirname, '.jest-mongodb.json');
  fs.writeFileSync(statePath, JSON.stringify({ uri, pid }, null, 2), 'utf8');
};


