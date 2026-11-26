/**
 * Source-level layout guard for the student dashboard header (repo pattern:
 * sharing/sharingWiring.test.ts; there is no RN render harness).
 *
 * The header once held Back, the student's name and four buttons in one row. With the Family
 * button added, Sync sat past the right edge on every phone and the Maestro smoke flow could
 * not find it. The name now has its own row and the buttons wrap.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const MOBILE = path.join(__dirname, '..', '..');
const read = (...p: string[]): string => fs.readFileSync(path.join(MOBILE, ...p), 'utf8');

const DASH = read('src', 'screens', 'DashboardScreen.tsx');
const SMOKE = read('e2e', 'maestro', 'smoke.yaml');

/** The body of one `name: { ... }` entry in the screen's StyleSheet. */
function styleBlock(name: string): string {
  const match = new RegExp(`\\n  ${name}: \\{([^}]*)\\}`).exec(DASH);
  if (!match) throw new Error(`style "${name}" not found in DashboardScreen.tsx`);
  return match[1] ?? '';
}

describe('student dashboard header layout', () => {
  it('gives the name its own row, closed before the action buttons start', () => {
    const top = DASH.indexOf('style={styles.headerTop}');
    const title = DASH.indexOf('testID="text-dashboard-title"');
    const actions = DASH.indexOf('style={styles.headerActions}');
    expect(top).toBeGreaterThan(-1);
    expect(title).toBeGreaterThan(top);
    expect(actions).toBeGreaterThan(title);
    // Exactly one closing </View> (the name row) sits between the name and the buttons.
    expect(DASH.slice(title, actions).match(/<\/View>/g)).toHaveLength(1);
  });

  it('stacks the two rows instead of laying the whole header out in one line', () => {
    expect(styleBlock('header')).not.toMatch(/flexDirection: 'row'/);
    expect(styleBlock('headerTop')).toMatch(/flexDirection: 'row'/);
  });

  it('lets the buttons wrap and a long name shorten, so nothing leaves the screen', () => {
    expect(styleBlock('headerActions')).toMatch(/flexWrap: 'wrap'/);
    expect(styleBlock('title')).toMatch(/flex: 1/);
    expect(DASH).toMatch(/style=\{styles\.title\} numberOfLines=\{1\}/);
  });

  it('keeps every action inside the wrapping row, Sync included', () => {
    const actions = DASH.indexOf('style={styles.headerActions}');
    const tabs = DASH.indexOf('style={styles.tabs}');
    const row = DASH.slice(actions, tabs);
    for (const id of ['button-family', 'button-edit-student', 'button-sync']) {
      expect(row).toContain(`testID="${id}"`);
    }
    expect(row).toContain('onPress={onRunHistory}');
  });

  it('the smoke flow still proves Sync is on screen', () => {
    expect(SMOKE).toMatch(/visible:\s*\n\s*id: button-sync/);
  });
});
