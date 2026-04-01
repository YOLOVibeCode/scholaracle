import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { UserRepository } from '@scholaracle/database';
import { AdminUserRepository } from '@scholaracle/database';
import { StudentRepository } from '@scholaracle/database';
import { AlertRepository } from '@scholaracle/database';
import { PaymentRepository } from '@scholaracle/database';
import { SubscriptionRepository } from '@scholaracle/database';
import { AuditLogRepository } from '@scholaracle/database';
import { CommunicationLogRepository } from '@scholaracle/database';
import type { AdminRole } from '@scholaracle/database';
import {
  DEMO_USER,
  DEMO_STUDENTS,
  DEMO_CONTACT_JESSICA,
  DEMO_CONTACT_RICKY,
  DEMO_CONTACT_JENNIFER,
  DEMO_CONTACT_PASSWORD,
  buildDemoCourseDocs,
  buildDemoAssignmentDocs,
  buildDemoEventSeries,
  buildDemoAlerts,
  buildDemoMaterialDocs,
  buildDemoAssetDocs,
  buildDemoGradeHistory,
  buildDemoGradeSnapshots,
  buildDemoAttendanceDocs,
} from './demo-data';
import type { ISharedParent } from '@scholaracle/database';

export interface ISeedRouterConfig {
  readonly database: Db;
  readonly jwtSecret?: string;
}

/**
 * Test users configuration matching E2E test data.
 */
/**
 * Known TOTP secret for E2E testing. Admin accounts are seeded with MFA pre-configured
 * using this secret so E2E tests can generate valid TOTP codes.
 */
const E2E_MFA_SECRET = 'JBSWY3DPEHPK3PXP';

const TEST_USERS = {
  parent: {
    email: 'test.parent@example.com',
    password: 'TestPass123!',
    name: 'Test Parent',
  },
  parent2: {
    email: 'test.parent2@example.com',
    password: 'TestPass123!',
    name: 'Test Parent 2',
  },
  parent3: {
    email: 'test.parent3@example.com',
    password: 'TestPass123!',
    name: 'Test Parent 3',
  },
  admin: {
    email: 'admin@scholarmancy.com',
    password: 'Admin123!',
    name: 'Admin User',
    role: 'admin' as AdminRole,
  },
  analyst: {
    email: 'analyst@scholarmancy.com',
    password: 'Admin123!',
    name: 'Analyst',
    role: 'admin' as AdminRole,
  },
} as const;

/**
 * Handle seed request.
 * Creates all test users, students, and alerts for E2E testing.
 */
async function handleSeed(req: Request, res: Response, config: ISeedRouterConfig): Promise<void> {
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
    const paymentRepository = new PaymentRepository(config.database);
    const subscriptionRepository = new SubscriptionRepository(config.database);
    const auditLogRepository = new AuditLogRepository(config.database);
    const communicationLogRepository = new CommunicationLogRepository(config.database);
    const authService = new AuthService(config.database);
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
      payments: {
        created: [] as string[],
        errors: [] as string[],
      },
      subscriptions: {
        created: [] as string[],
        errors: [] as string[],
      },
      auditLogs: {
        created: [] as string[],
        errors: [] as string[],
      },
      communications: {
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

    // 1b. Create additional parent users for bulk-send segmentation tests
    for (const extra of [TEST_USERS.parent2, TEST_USERS.parent3]) {
      try {
        const existing = await userRepository.findByEmail(extra.email);
        if (existing) {
          if (shouldForce) {
            await userRepository.delete(existing._id!.toString());
            const result = await authService.register(extra.email, extra.password, extra.name);
            if (result.success) results.users.created.push(`Parent: ${extra.email}`);
            else results.users.errors.push(`Parent: ${result.error}`);
          } else {
            results.users.existing.push(`Parent: ${extra.email}`);
          }
        } else {
          const result = await authService.register(extra.email, extra.password, extra.name);
          if (result.success) results.users.created.push(`Parent: ${extra.email}`);
          else results.users.errors.push(`Parent: ${result.error}`);
        }
      } catch (error) {
        results.users.errors.push(
          `Parent: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    // 2. Create admin user
    let superAdminId: string | null = null;

    // Create admin user
    // Create admin user
    try {
      const userConfig = TEST_USERS.admin;
      const existingAdmin = await adminRepository.findByEmail(userConfig.email);
      if (existingAdmin) {
        if (shouldForce) {
          const objectId = existingAdmin._id!;
          await config.database.collection('admin_users').deleteOne({ _id: objectId });
          const passwordHash = await AdminUserRepository.hashPassword(userConfig.password);
          const admin = await adminRepository.create({
            email: userConfig.email,
            passwordHash,
            name: userConfig.name,
            role: userConfig.role,
            isActive: true,
            mfaEnabled: true,
            mfaSecret: E2E_MFA_SECRET,
          });
          superAdminId = admin._id!.toString();
          results.admins.created.push(`admin: ${userConfig.email}`);
        } else {
          superAdminId = existingAdmin._id!.toString();
          results.admins.existing.push(`admin: ${userConfig.email}`);
        }
      } else {
        const passwordHash = await AdminUserRepository.hashPassword(userConfig.password);
        const admin = await adminRepository.create({
          email: userConfig.email,
          passwordHash,
          name: userConfig.name,
          role: userConfig.role,
          isActive: true,
          mfaEnabled: true,
          mfaSecret: E2E_MFA_SECRET,
        });
        superAdminId = admin._id!.toString();
        results.admins.created.push(`admin: ${userConfig.email}`);
      }
    } catch (error) {
      results.admins.errors.push(
        `admin: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // Create analyst admin (for E2E and lockout tests)
    try {
      const userConfig = TEST_USERS.analyst;
      const existingAnalyst = await adminRepository.findByEmail(userConfig.email);
      if (existingAnalyst) {
        if (shouldForce) {
          const objectId = existingAnalyst._id!;
          await config.database.collection('admin_users').deleteOne({ _id: objectId });
          const passwordHash = await AdminUserRepository.hashPassword(userConfig.password);
          await adminRepository.create({
            email: userConfig.email,
            passwordHash,
            name: userConfig.name,
            role: userConfig.role,
            isActive: true,
            mfaEnabled: true,
            mfaSecret: E2E_MFA_SECRET,
          });
          results.admins.created.push(`admin: ${userConfig.email}`);
        } else {
          results.admins.existing.push(`admin: ${userConfig.email}`);
        }
      } else {
        const passwordHash = await AdminUserRepository.hashPassword(userConfig.password);
        await adminRepository.create({
          email: userConfig.email,
          passwordHash,
          name: userConfig.name,
          role: userConfig.role,
          isActive: true,
          mfaEnabled: true,
          mfaSecret: E2E_MFA_SECRET,
        });
        results.admins.created.push(`admin: ${userConfig.email}`);
      }
    } catch (error) {
      results.admins.errors.push(
        `analyst: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
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

          results.students.created.push(
            `Student: ${studentData.name} (${student._id?.toString()})`
          );
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

    // 5. Create test payments (for admin payments UI/E2E)
    if (parentUser && parentUser._id) {
      const userId = parentUser._id.toString();
      try {
        const existingPayments = await paymentRepository.findByUserId(userId);
        if (existingPayments.length === 0 || shouldForce) {
          if (shouldForce && existingPayments.length > 0) {
            await config.database.collection('payments').deleteMany({ userId });
          }

          const p1 = await paymentRepository.create({
            userId,
            amount: 1900,
            currency: 'usd',
            status: 'succeeded',
            paymentMethod: 'card',
          });
          results.payments.created.push(`Payment: succeeded (${p1._id?.toString()})`);

          const p2 = await paymentRepository.create({
            userId,
            amount: 2900,
            currency: 'usd',
            status: 'failed',
            paymentMethod: 'card',
          });
          results.payments.created.push(`Payment: failed (${p2._id?.toString()})`);
        }
      } catch (error) {
        results.payments.errors.push(error instanceof Error ? error.message : 'Unknown error');
      }
    }

    // 6. Create test subscription (for subscription UI/E2E)
    if (parentUser && parentUser._id) {
      const userId = parentUser._id.toString();
      try {
        const existing = await subscriptionRepository.findByUserId(userId);
        if (!existing || shouldForce) {
          if (existing && shouldForce) {
            await config.database.collection('subscriptions').deleteMany({ userId });
          }

          const start = new Date();
          const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          const sub = await subscriptionRepository.create({
            userId,
            plan: 'starter',
            status: 'trialing',
            currentPeriodStart: start,
            currentPeriodEnd: end,
            billingCycle: 'monthly',
          });
          results.subscriptions.created.push(`Subscription: trialing (${sub._id?.toString()})`);
        }
      } catch (error) {
        results.subscriptions.errors.push(error instanceof Error ? error.message : 'Unknown error');
      }
    }

    // 7. Create baseline audit log (for audit log viewer E2E)
    if (superAdminId) {
      try {
        const existingCount = await config.database
          .collection('audit_logs')
          .countDocuments({ action: 'system:export' });
        if (existingCount === 0 || shouldForce) {
          if (shouldForce) {
            await config.database.collection('audit_logs').deleteMany({ action: 'system:export' });
          }
          const log = await auditLogRepository.create({
            adminUserId: superAdminId,
            adminEmail: TEST_USERS.admin.email,
            action: 'system:export',
            entityType: 'system',
            entityId: 'seed',
            reason: 'Seed baseline audit entry',
            ipAddress: req.ip ?? 'unknown',
            userAgent: req.headers['user-agent'] ?? 'seed',
          });
          results.auditLogs.created.push(`AuditLog: system:export (${log._id?.toString()})`);
        }
      } catch (error) {
        results.auditLogs.errors.push(error instanceof Error ? error.message : 'Unknown error');
      }
    }

    // 8. Create baseline communication log (for communications center E2E)
    if (parentUser && parentUser._id && superAdminId) {
      try {
        const existingCount = await config.database
          .collection('communication_logs')
          .countDocuments({ subject: 'Seed Communication' });
        if (existingCount === 0 || shouldForce) {
          if (shouldForce) {
            await config.database
              .collection('communication_logs')
              .deleteMany({ subject: 'Seed Communication' });
          }
          const comm = await communicationLogRepository.create({
            userId: parentUser._id.toString(),
            channel: 'email',
            type: 'support',
            subject: 'Seed Communication',
            content: 'This is a seeded communication log entry.',
            recipientEmail: parentUser.email,
            status: 'sent',
            sentAt: new Date(),
            triggeredBy: 'admin',
            adminUserId: superAdminId,
          });
          results.communications.created.push(
            `CommunicationLog: Seed Communication (${comm._id?.toString()})`
          );
        }
      } catch (error) {
        results.communications.errors.push(
          error instanceof Error ? error.message : 'Unknown error'
        );
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
        paymentsCreated: results.payments.created.length,
        paymentsErrors: results.payments.errors.length,
        subscriptionsCreated: results.subscriptions.created.length,
        subscriptionsErrors: results.subscriptions.errors.length,
        auditLogsCreated: results.auditLogs.created.length,
        auditLogsErrors: results.auditLogs.errors.length,
        communicationsCreated: results.communications.created.length,
        communicationsErrors: results.communications.errors.length,
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

function isDemoAllowed(): boolean {
  const demoEnabled = process.env['DEMO_ENABLED'] === 'true';
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  return demoEnabled || nodeEnv === 'development' || nodeEnv === 'test';
}

/**
 * POST /api/seed/demo — Create or ensure demo user + SLC data exists.
 */
async function handleDemoSeed(
  _req: Request,
  res: Response,
  config: ISeedRouterConfig
): Promise<void> {
  try {
    if (!isDemoAllowed()) {
      res.status(403).json({ success: false, error: 'Demo is not enabled' });
      return;
    }

    const userRepository = new UserRepository(config.database);
    const studentRepository = new StudentRepository(config.database);
    const alertRepository = new AlertRepository(config.database);
    const authService = new AuthService(config.database);

    let user = await userRepository.findByEmail(DEMO_USER.email);
    if (!user) {
      const result = await authService.register(
        DEMO_USER.email,
        DEMO_USER.password,
        DEMO_USER.name
      );
      if (!result.success) {
        res
          .status(500)
          .json({ success: false, error: result.error ?? 'Failed to create demo user' });
        return;
      }
      user = await userRepository.findByEmail(DEMO_USER.email);
    }
    if (!user?._id) {
      res.status(500).json({ success: false, error: 'Demo user not found after create' });
      return;
    }

    const userId = user._id.toString();

    const students = [...(await studentRepository.findByUserId(userId))];
    const existingNames = new Set(students.map((s) => s.name));
    for (const demoStudent of DEMO_STUDENTS) {
      if (!existingNames.has(demoStudent.name)) {
        const created = await studentRepository.create({
          userId: user._id,
          name: demoStudent.name,
          grade: demoStudent.grade,
          studentId: demoStudent.studentId,
        });
        students.push(created);
        existingNames.add(demoStudent.name);
      }
    }

    const emma = students.find((s) => s.studentId === DEMO_STUDENTS[0].studentId);
    const liam = students.find((s) => s.studentId === DEMO_STUDENTS[1].studentId);
    const emmaId = emma?._id?.toString();
    const liamId = liam?._id?.toString();

    // Ensure demo contact users exist (for accepted contacts)
    for (const email of [DEMO_CONTACT_JESSICA, DEMO_CONTACT_RICKY]) {
      const existing = await userRepository.findByEmail(email);
      if (!existing) {
        await authService.register(email, DEMO_CONTACT_PASSWORD, email.split('@')[0] ?? 'Demo');
      }
    }
    const jessicaUser = await userRepository.findByEmail(DEMO_CONTACT_JESSICA);
    const rickyUser = await userRepository.findByEmail(DEMO_CONTACT_RICKY);
    const invitedAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const acceptedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

    const emmaSharedWith: ISharedParent[] = [
      {
        userId: jessicaUser?._id?.toString(),
        email: DEMO_CONTACT_JESSICA,
        name: 'Jessica Demo',
        role: 'parent',
        status: 'accepted',
        invitedAt,
        acceptedAt,
        receiveAlerts: true,
        alertChannels: ['email', 'sms'],
      },
      {
        userId: rickyUser?._id?.toString(),
        email: DEMO_CONTACT_RICKY,
        name: 'Ricky Demo',
        role: 'guardian',
        status: 'accepted',
        invitedAt,
        acceptedAt,
        receiveAlerts: true,
        alertChannels: ['email'],
      },
    ];
    const liamSharedWith: ISharedParent[] = [
      {
        userId: jessicaUser?._id?.toString(),
        email: DEMO_CONTACT_JESSICA,
        name: 'Jessica Demo',
        role: 'parent',
        status: 'accepted',
        invitedAt,
        acceptedAt,
        receiveAlerts: true,
        alertChannels: ['email', 'sms'],
      },
      {
        email: DEMO_CONTACT_JENNIFER,
        name: 'Jennifer Demo',
        role: 'parent',
        status: 'pending',
        invitedAt,
        receiveAlerts: true,
        alertChannels: ['email'],
      },
    ];
    if (emmaId) await studentRepository.update(emmaId, { sharedWith: emmaSharedWith });
    if (liamId) await studentRepository.update(liamId, { sharedWith: liamSharedWith });

    const assignmentsColl = config.database.collection('slc_assignments');
    const coursesColl = config.database.collection('slc_courses');
    const eventSeriesColl = config.database.collection('slc_event_series');
    const materialsColl = config.database.collection('slc_course_materials');
    const assetsColl = config.database.collection('slc_assets');
    const gradeHistoryColl = config.database.collection('slc_grade_history');
    const gradeSnapshotsColl = config.database.collection('slc_grade_snapshots');
    const attendanceColl = config.database.collection('slc_attendance_events');

    const existingAssignments = await assignmentsColl.countDocuments({ userId, provider: 'demo' });
    const baseDate = new Date();

    if (existingAssignments === 0) {
      const courseDocs = buildDemoCourseDocs(userId);
      await coursesColl.insertMany(courseDocs);
      const assignmentDocs = buildDemoAssignmentDocs(userId, baseDate);
      await assignmentsColl.insertMany(assignmentDocs);
      const eventDocs = buildDemoEventSeries(userId, baseDate);
      await eventSeriesColl.insertMany(eventDocs);
      const materialDocs = buildDemoMaterialDocs(userId);
      await materialsColl.insertMany(materialDocs);
      const assetDocs = buildDemoAssetDocs(userId);
      if (assetDocs.length > 0) {
        await assetsColl.insertMany(assetDocs);
      }
      const gradeHistoryDocs = buildDemoGradeHistory(userId, baseDate);
      await gradeHistoryColl.insertMany(gradeHistoryDocs);
      const gradeSnapshotDocs = buildDemoGradeSnapshots(userId, baseDate);
      await gradeSnapshotsColl.insertMany(gradeSnapshotDocs);
      const attendanceDocs = buildDemoAttendanceDocs(userId, baseDate);
      await attendanceColl.insertMany(attendanceDocs);
    }

    if (emmaId && liamId) {
      const existingAlerts = await config.database.collection('alerts').countDocuments({
        userId,
        studentId: { $in: [emmaId, liamId] },
      });
      if (existingAlerts === 0) {
        const alertDocs = buildDemoAlerts(userId, emmaId, liamId);
        for (const a of alertDocs) {
          await alertRepository.create({
            studentId: a.studentId,
            userId: a.userId,
            type: a.type,
            severity: a.severity,
            message: a.message,
            relatedData: a.relatedData,
            acknowledged: a.acknowledged,
          });
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Demo data ready',
      demoEmail: DEMO_USER.email,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

/**
 * POST /api/seed/demo/reset — Wipe demo user data and re-seed.
 */
async function handleDemoReset(
  req: Request,
  res: Response,
  config: ISeedRouterConfig
): Promise<void> {
  try {
    if (!isDemoAllowed()) {
      res.status(403).json({ success: false, error: 'Demo is not enabled' });
      return;
    }

    const userRepository = new UserRepository(config.database);
    const studentRepository = new StudentRepository(config.database);
    const user = await userRepository.findByEmail(DEMO_USER.email);
    if (!user?._id) {
      res.status(200).json({ success: true, message: 'No demo user to reset' });
      return;
    }

    const userId = user._id.toString();

    await config.database.collection('slc_assignments').deleteMany({ userId });
    await config.database.collection('slc_courses').deleteMany({ userId });
    await config.database.collection('slc_event_series').deleteMany({ userId });
    await config.database.collection('slc_course_materials').deleteMany({ userId });
    await config.database.collection('slc_assets').deleteMany({ userId });
    await config.database.collection('slc_grade_history').deleteMany({ userId });
    await config.database.collection('slc_grade_snapshots').deleteMany({ userId });
    await config.database.collection('slc_attendance_events').deleteMany({ userId });
    await config.database.collection('alerts').deleteMany({ userId });

    const students = await studentRepository.findByUserId(userId);
    for (const s of students) {
      if (s._id) await studentRepository.delete(s._id.toString());
    }

    await handleDemoSeed(req, res, config);
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

  /**
   * POST /api/seed/demo
   * Ensure demo user and realistic SLC data exist (for "Try Demo").
   */
  router.post('/demo', (req: Request, res: Response) => {
    void handleDemoSeed(req, res, config);
  });

  /**
   * POST /api/seed/demo/reset
   * Wipe demo user's data and re-seed from scratch.
   */
  router.post('/demo/reset', (req: Request, res: Response) => {
    void handleDemoReset(req, res, config);
  });

  /**
   * POST /api/seed/set-password
   * Set password for a user (dev/test only).
   * Body: { email: string, password: string }
   */
  router.post('/set-password', async (req: Request, res: Response) => {
    if (!isDemoAllowed()) {
      res.status(403).json({ success: false, error: 'Not allowed in production' });
      return;
    }

    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Missing email or password' });
      return;
    }

    try {
      const userRepository = new UserRepository(config.database);
      const user = await userRepository.findByEmail(email);
      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }

      const passwordHash = await UserRepository.hashPassword(password);
      await userRepository.update(user._id!.toString(), { passwordHash });

      res.json({ success: true, message: `Password set for ${email}` });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/seed/add-parent
   * Add a parent with accepted status directly to a student (dev/test only).
   * Body: { studentId: string, email: string, name: string, role?: string, userId?: string }
   */
  router.post('/add-parent', async (req: Request, res: Response) => {
    if (!isDemoAllowed()) {
      res.status(403).json({ success: false, error: 'Not allowed in production' });
      return;
    }

    const { studentId, email, name, role, userId } = req.body as {
      studentId?: string;
      email?: string;
      name?: string;
      role?: string;
      userId?: string;
    };

    if (!studentId || !email) {
      res.status(400).json({ success: false, error: 'Missing studentId or email' });
      return;
    }

    try {
      const studentRepository = new StudentRepository(config.database);
      const student = await studentRepository.findById(studentId);
      if (!student) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }

      const normalizedEmail = email.toLowerCase().trim();
      const parentRole = (role === 'guardian' || role === 'caregiver' ? role : 'parent') as
        | 'parent'
        | 'guardian'
        | 'caregiver';

      const existingIdx = student.sharedWith.findIndex((sp) => sp.email === normalizedEmail);
      if (existingIdx >= 0) {
        // Update existing
        const updated = [...student.sharedWith];
        updated[existingIdx] = {
          email: normalizedEmail,
          name: name || updated[existingIdx]!.name,
          userId,
          role: parentRole,
          status: 'accepted',
          invitedAt: updated[existingIdx]!.invitedAt || new Date(),
          acceptedAt: new Date(),
        };
        await studentRepository.update(student._id!, { sharedWith: updated });
      } else {
        // Add new
        const newShared = [
          ...student.sharedWith,
          {
            email: normalizedEmail,
            name,
            userId,
            role: parentRole,
            status: 'accepted' as const,
            invitedAt: new Date(),
            acceptedAt: new Date(),
          },
        ];
        await studentRepository.update(student._id!, { sharedWith: newShared });
      }

      res.json({
        success: true,
        message: `Parent ${email} added to student ${student.name}`,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
