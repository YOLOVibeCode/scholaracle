import type { Db } from 'mongodb';
import type { IEmailTransport } from '@scholaracle/agents';
import { buildGlanceEmail } from '@scholaracle/agents';
import type { ICommunicationLogData } from '@scholaracle/database';
import type { GlanceInsightService, IGlanceInsightInput } from '@scholaracle/agents';
import { fetchGlanceData } from './glance-data-fetcher';
import { logger } from '../logger';

export class GlanceSender {
  constructor(
    private readonly _database: Db,
    private readonly _transport: IEmailTransport,
    private readonly _fromEmail: string,
    private readonly _fromName: string,
    private readonly _dashboardBaseUrl: string,
    private readonly _commLogRepo: {
      create(log: ICommunicationLogData): Promise<unknown>;
    },
    private readonly _insightService?: GlanceInsightService
  ) {}

  async sendGlanceForStudent(
    userId: string,
    studentId: string,
    studentName: string,
    recipientEmail: string,
    recipientType?: 'parent' | 'student'
  ): Promise<void> {
    const data = await fetchGlanceData(
      this._database,
      userId,
      studentId,
      studentName,
      this._dashboardBaseUrl ?? ''
    );

    let aiInsight: string | undefined;
    if (this._insightService) {
      try {
        const lowestGrade = data.grades.length > 0 ? data.grades[0] : undefined;
        const input: IGlanceInsightInput = {
          studentName,
          gradeCount: data.grades.length,
          lowestGradePercent: lowestGrade?.percentGrade,
          lowestGradeCourse: lowestGrade?.courseName,
          missingCount: data.missingAssignments.length,
          upcomingCount: data.upcomingDeadlines.length,
          missingTitles: data.missingAssignments.map((a) => a.title),
        };
        aiInsight = await this._insightService.generateInsight(input);
      } catch {
        // best-effort
      }
    }

    const dashboardUrl = this._dashboardBaseUrl
      ? `${this._dashboardBaseUrl.replace(/\/$/, '')}/dashboard/students/${studentId}/view`
      : undefined;

    const { subject, html } = buildGlanceEmail({
      studentName,
      grades: data.grades,
      missingAssignments: data.missingAssignments,
      upcomingDeadlines: data.upcomingDeadlines,
      aiInsight,
      dashboardUrl,
      recipientType,
    });

    const text = `${studentName}'s daily snapshot. ${data.missingAssignments.length} missing assignment(s).`;

    try {
      await this._transport.send({
        to: recipientEmail,
        from: { email: this._fromEmail, name: this._fromName },
        subject,
        text,
        html,
      });
      await this._commLogRepo.create({
        userId,
        channel: 'email' as const,
        type: 'notification' as const,
        subject,
        content: text,
        htmlContent: html,
        recipientEmail,
        status: 'sent' as const,
        sentAt: new Date(),
        triggeredBy: 'scheduled',
        templateName: 'email_glance',
        relatedEntityType: 'student',
        relatedEntityId: studentId,
      });
    } catch (err) {
      logger.error(
        { err, studentId, recipientEmail, job: 'glance-email' },
        'failed to send glance email'
      );
      await this._commLogRepo
        .create({
          userId,
          channel: 'email' as const,
          type: 'notification' as const,
          subject,
          content: text,
          htmlContent: html,
          recipientEmail,
          status: 'failed' as const,
          failedAt: new Date(),
          failureReason: err instanceof Error ? err.message : String(err),
          triggeredBy: 'scheduled',
          templateName: 'email_glance',
          relatedEntityType: 'student',
          relatedEntityId: studentId,
        })
        .catch(() => {});
    }
  }
}
