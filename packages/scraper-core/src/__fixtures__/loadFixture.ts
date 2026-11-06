/**
 * Read UTF-8 fixture text relative to this package's __fixtures__ directory.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

export function loadFixture(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), 'utf8');
}
