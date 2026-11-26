/**
 * Ensure src/credentials/companionDevSeed.generated.ts exists.
 *
 * metro.config.js generates that module from companion.env.local on dev
 * machines, but it is gitignored — fresh checkouts and CI have no Metro run,
 * so tsc/jest cannot resolve the import. This writes the null stub ONLY when
 * the file is absent; a Metro-generated file (which may hold real dev
 * credentials) is never overwritten.
 */

const fs = require('fs');
const path = require('path');
const { GENERATED_MODULE, renderSeedModule } = require('./companion-dev-seed');

const genPath = path.join(__dirname, '..', GENERATED_MODULE);

if (!fs.existsSync(genPath)) {
  fs.mkdirSync(path.dirname(genPath), { recursive: true });
  fs.writeFileSync(genPath, renderSeedModule(null));
  process.stderr.write('[ensure-companion-dev-seed] wrote null stub\n');
}
