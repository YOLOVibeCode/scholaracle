import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { AdminAuthService } from '@scholaracle/auth';
import { UserRepository } from '@scholaracle/database';
import { AdminUserRepository } from '@scholaracle/database';
import { StudentRepository } from '@scholaracle/database';
import { AlertRepository } from '@scholaracle/database';
import type { AdminRole } from '@scholaracle/database';

export interface ISeedRouterConfig {
  readonly database: Db;
  readonly jwtSecret?: string;
}

/**
 * Test users configuration matching E2E test data.
 */
const TEST_USERS = {
  parent: {
    email: 'test.parent@example.com',
    password: 'TestPass123!',
    name: 'Test Parent',
  },
  super_admin: {
    email: 'super@scholaracle.com',
    password: 'SuperAdmin123!',
    name: 'Super Admin',
    role: 'super_admin' as AdminRole,
  },
  admin: {
    email: 'admin@scholaracle.com',
    password: 'Admin123!',
    name: 'Admin User',
    role: 'admin' as AdminRole,
  },
  support: {
    email: 'support@scholaracle.com',
    password: 'Support123!',
    name: 'Support User',
    role: 'support' as AdminRole,
  },
  billing: {
    email: 'billing@scholaracle.com',
    password: 'Billing123!',
    name: 'Billing User',
    role: 'billing' as AdminRole,
  },
  analyst: {
    email: 'analyst@scholaracle.com',
    password: 'Analyst123!',
    name: 'Analyst User',
    role: 'analyst' as AdminRole,
  },
} as const;

/**
 * Handle seed request.
 * Creates all test users, students, and alerts for E2E testing.
 */
async function handleSeed(
  req: Request,
  res: Response,
  config: ISeedRouterConfig
): Promise<void> {
  try {
    // Only allow seeding in development/test environments
    const nodeEnv = process.env['NODE_ENV'] ?? 'development';
    if (nodeEnv === 'production') {
      res.status(403).json({
        success: false,
        error: 'Seeding is not allowed in production',
      });
      return;
    }

    const { force } = req.query as { force?: string };
    const shouldForce = force === 'true';

    const userRepository = new UserRepository(config.database);
    const adminRepository = new AdminUserRepository(config.database);
    const studentRepository = new StudentRepository(config.database);
    const alertRepository = new AlertRepository(config.database);
    const authService = new AuthService(config.database);
    const jwtSecret = config.jwtSecret ?? process.env['JWT_SECRET'] ?? 'test-secret';
    const adminAuthService = new AdminAuthService(config.database, jwtSecret);

    const results = {
      users: {
        created: [] as string[],
        existing: [] as string[],
        errors: [] as string[],
      },
      admins: {
        created: [] as string[],
        existing: [] as string[],
        errors: [] as string[],
      },
      students: {
        created: [] as string[],
        errors: [] as string[],
      },
      alerts: {
        created: [] as string[],
        errors: [] as string[],
      },
    };

    // 1. Create parent user
    try {
      const existingParent = await userRepository.findByEmail(TEST_USERS.parent.email);
      if (existingParent) {
        if (shouldForce) {
          // Delete and recreate - need to delete students first
          const students = await studentRepository.findByUserId(existingParent._id!.toString());
          for (const student of students) {
            if (student._id) {
              await studentRepository.delete(student._id);
            }
          }
          await userRepository.delete(existingParent._id!.toString());
          const result = await authService.register(
            TEST_USERS.parent.email,
            TEST_USERS.parent.password,
            TEST_USERS.parent.name
          );
          if (result.success) {
            results.users.created.push(`Parent: ${TEST_USERS.parent.email}`);
          } else {
            results.users.errors.push(`Parent: ${result.error}`);
          }
        } else {
          results.users.existing.push(`Parent: ${TEST_USERS.parent.email}`);
        }
      } else {
        const result = await authService.register(
          TEST_USERS.parent.email,
          TEST_USERS.parent.password,
          TEST_USERS.parent.name
        );
        if (result.success) {
          results.users.created.push(`Parent: ${TEST_USERS.parent.email}`);
        } else {
          results.users.errors.push(`Parent: ${result.error}`);
        }
      }
    } catch (error) {
      results.users.errors.push(
        `Parent: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // 2. Create admin users (need super_admin first)
    let superAdminId: string | null = null;

    // First, check if super_admin exists or create it
    try {
      let superAdmin = await adminRepository.findByEmail(TEST_USERS.super_admin.email);
      if (!superAdmin) {
        // Create super_admin directly (bypassing the service requirement)
        const passwordHash = await AdminUserRepository.hashPassword(TEST_USERS.super_admin.password);
        const adminData = {
          email: TEST_USERS.super_admin.email,
          passwordHash,
          name: TEST_USERS.super_admin.name,
          role: TEST_USERS.super_admin.role,
          isActive: true,
        };
        superAdmin = await adminRepository.create(adminData);
        results.admins.created.push(`Super Admin: ${TEST_USERS.super_admin.email}`);
      } else {
        if (shouldForce) {
          // Delete existing super_admin using database collection directly
          const objectId = superAdmin._id!;
          await config.database.collection('admin_users').deleteOne({ _id: objectId });
          const passwordHash = await AdminUserRepository.hashPassword(TEST_USERS.super_admin.password);
          const adminData = {
            email: TEST_USERS.super_admin.email,
            passwordHash,
            name: TEST_USERS.super_admin.name,
            role: TEST_USERS.super_admin.role,
            isActive: true,
          };
          superAdmin = await adminRepository.create(adminData);
          results.admins.created.push(`Super Admin: ${TEST_USERS.super_admin.email}`);
        } else {
          results.admins.existing.push(`Super Admin: ${TEST_USERS.super_admin.email}`);
        }
      }
      superAdminId = superAdmin._id!.toString();
    } catch (error) {
      results.admins.errors.push(
        `Super Admin: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // Create other admin users
    const adminRoles: Array<'admin' | 'support' | 'billing' | 'analyst'> = ['admin', 'support', 'billing', 'analyst'];
    for (const role of adminRoles) {
      if (!superAdminId) {
        results.admins.errors.push(`${role}: Cannot create - super_admin not available`);
        continue;
      }

      try {
        const userConfig = TEST_USERS[role];
        const existingAdmin = await adminRepository.findByEmail(userConfig.email);
        if (existingAdmin) {
          if (shouldForce) {
            // Delete existing admin using database collection directly
            const objectId = existingAdmin._id!;
            await config.database.collection('admin_users').deleteOne({ _id: objectId });
            const result = await adminAuthService.register(
              userConfig.email,
              userConfig.password,
              userConfig.name,
              userConfig.role,
              superAdminId
            );
            if (result.success) {
              results.admins.created.push(`${role}: ${userConfig.email}`);
            } else {
              results.admins.errors.push(`${role}: ${result.error}`);
            }
          } else {
            results.admins.existing.push(`${role}: ${userConfig.email}`);
          }
        } else {
          const result = await adminAuthService.register(
            userConfig.email,
            userConfig.password,
            userConfig.name,
            userConfig.role,
            superAdminId
          );
          if (result.success) {
            results.admins.created.push(`${role}: ${userConfig.email}`);
          } else {
            results.admins.errors.push(`${role}: ${result.error}`);
          }
        }
      } catch (error) {
        results.admins.errors.push(
          `${role}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    // 3. Create test students for parent user
    const parentUser = await userRepository.findByEmail(TEST_USERS.parent.email);
    if (parentUser && parentUser._id) {
      const testStudents = [
        {
          name: 'Student One',
          grade: 9,
          studentId: 'STU001',
        },
        {
          name: 'Student Two',
          grade: 11,
          studentId: 'STU002',
        },
      ];

      for (const studentData of testStudents) {
        try {
          // Check if student already exists
          const existingStudents = await studentRepository.findByUserId(parentUser._id.toString());
          const exists = existingStudents.some((s) => s.name === studentData.name);

          if (exists && !shouldForce) {
            continue;
          }

          if (exists && shouldForce) {
            const existing = existingStudents.find((s) => s.name === studentData.name);
            if (existing && existing._id) {
              await studentRepository.delete(existing._id.toString());
            }
          }

          const student = await studentRepository.create({
            userId: parentUser._id,
            name: studentData.name,
            grade: studentData.grade,
            studentId: studentData.studentId,
          });

          results.students.created.push(`Student: ${studentData.name} (${student._id?.toString()})`);
        } catch (error) {
          results.students.errors.push(
            `${studentData.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
    }

    // 4. Create test alerts
    if (parentUser && parentUser._id) {
      const students = await studentRepository.findByUserId(parentUser._id.toString());
      const firstStudent = students.length > 0 ? students[0] : null;
      if (firstStudent && firstStudent._id) {
        const testAlerts = [
          {
            type: 'MISSING_ASSIGNMENT',
            severity: 'warning',
            message: 'Math homework due tomorrow',
            relatedData: {
              assignmentName: 'Math homework',
              dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
              points: 25,
            },
          },
          {
            type: 'GRADE_DROP',
            severity: 'critical',
            message: 'Science grade dropped 10%',
            relatedData: {
              courseName: 'Science',
              previousGrade: 90,
              currentGrade: 80,
              dropPercentage: 10,
            },
          },
        ];

        for (const alertData of testAlerts) {
          try {
            const alert = await alertRepository.create({
              studentId: firstStudent._id.toString(),
              userId: parentUser._id.toString(),
              type: alertData.type,
              severity: alertData.severity,
              message: alertData.message,
              relatedData: alertData.relatedData,
              acknowledged: false,
            });

            results.alerts.created.push(`Alert: ${alertData.type} (${alert.id ?? 'unknown'})`);
          } catch (error) {
            results.alerts.errors.push(
              `${alertData.type}: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
          }
        }
      }
    }

    // Summary
    const summary = {
      success: true,
      message: 'Seeding completed',
      results,
      totals: {
        usersCreated: results.users.created.length,
        usersExisting: results.users.existing.length,
        usersErrors: results.users.errors.length,
        adminsCreated: results.admins.created.length,
        adminsExisting: results.admins.existing.length,
        adminsErrors: results.admins.errors.length,
        studentsCreated: results.students.created.length,
        studentsErrors: results.students.errors.length,
        alertsCreated: results.alerts.created.length,
        alertsErrors: results.alerts.errors.length,
      },
    };

    res.status(200).json(summary);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

/**
 * Create seed router.
 *
 * @param config - Router configuration
 * @returns Express router
 */
export function seedRouter(config: ISeedRouterConfig): Router {
  const router = Router();

  /**
   * POST /api/seed
   * Seed the database with test data for E2E tests.
   * Query params:
   *   - force=true: Delete and recreate existing users
   */
  router.post('/', (req: Request, res: Response) => {
    void handleSeed(req, res, config);
  });

  return router;
}
