import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ACTION_LITERAL_PATTERN = /action:\s*'([^']+)'/g;

function walkTsFiles(dir: string, files: string[]): void {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkTsFiles(fullPath, files);
      continue;
    }
    if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) {
      continue;
    }
    if (fullPath.endsWith('/auth/auth.ts')) {
      continue;
    }
    files.push(fullPath);
  }
}

/**
 * Collect distinct audit `action` literals from admin route source (not tests).
 */
export function collectAdminMutationAuditActions(): string[] {
  const adminRoutesRoot = join(__dirname, '../routes/admin');
  const files: string[] = [];
  walkTsFiles(adminRoutesRoot, files);

  const actions = new Set<string>();
  for (const filePath of files) {
    const source = readFileSync(filePath, 'utf8');
    if (!source.includes('auditLogRepository.create') && !source.includes('auditLogRepo.create')) {
      continue;
    }
    for (const match of source.matchAll(ACTION_LITERAL_PATTERN)) {
      const action = match[1];
      if (action) {
        actions.add(action);
      }
    }
  }
  const dynamicMutationActions = [
    'coupon:enable',
    'coupon:disable',
    'customer:bulk_suspend',
    'customer:bulk_unsuspend',
    'customer:bulk_change_plan',
  ];
  for (const action of dynamicMutationActions) {
    actions.add(action);
  }
  return [...actions].sort();
}
