import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../platform/database/prisma.service";
import { SESSION_LIFETIMES } from "../auth/session.service";

/** What the message needs, read at send time (names and titles are never stored with the alert). */
export interface AlertContext {
  classId: string;
  examTitle: string;
  className: string;
  studentName: string;
}

export interface AlertDevice {
  id: string;
  pushToken: string;
}

/**
 * Who receives an alert, resolved when it is sent (024 data-model "Derived", research Y5, SC-004): the
 * devices of the class's teacher whose MOBILE session is valid now, the account ACTIVE and still holding
 * `chamada.registrar`, the class not archived and the exam not muted by that teacher. A revocation, an
 * expiry, a lost class or a mute between the occurrence and the send stops the alert.
 */
@Injectable()
export class AlertRecipients {
  constructor(private readonly prisma: PrismaService) {}

  async context(activityId: string, studentUserId: string): Promise<AlertContext | null> {
    const rows = await this.prisma.$queryRaw<AlertContext[]>`
      SELECT a.class_id AS "classId", a.title AS "examTitle", c.name AS "className", st.name AS "studentName"
      FROM class_activities a
      JOIN classes c ON c.id = a.class_id
      JOIN users st ON st.id = ${studentUserId}::uuid
      WHERE a.id = ${activityId}::uuid`;
    return rows[0] ?? null;
  }

  devices(classId: string, activityId: string, now: Date): Promise<AlertDevice[]> {
    const idleCutoff = new Date(now.getTime() - SESSION_LIFETIMES.MOBILE.idleMs);
    return this.prisma.$queryRaw<AlertDevice[]>(Prisma.sql`
      SELECT d.id, d.push_token AS "pushToken"
      FROM classes c
      JOIN users u ON u.id = c.teacher_id AND u.status = 'ACTIVE'
      JOIN mobile_devices d ON d.user_id = u.id
      JOIN sessions s ON s.id = d.session_id
      WHERE c.id = ${classId}::uuid
        AND c.status <> 'ARCHIVED'
        AND s.client = 'MOBILE'
        AND s.revoked_at IS NULL
        AND s.absolute_expires_at > ${now}
        AND s.last_used_at > ${idleCutoff}
        AND NOT EXISTS (
          SELECT 1 FROM exam_alert_mutes m WHERE m.teacher_user_id = u.id AND m.activity_id = ${activityId}::uuid
        )
        AND EXISTS (
          SELECT 1
          FROM user_roles ur
          JOIN role_permissions rp ON rp.role_id = ur.role_id
          JOIN permissions p ON p.id = rp.permission_id
          WHERE ur.user_id = u.id AND ur.status = 'ACTIVE' AND p.key = 'chamada.registrar'
        )
      ORDER BY d.created_at, d.id`);
  }
}
