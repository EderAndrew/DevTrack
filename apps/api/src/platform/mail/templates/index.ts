import { adminActivation, type AdminActivationMailParams } from "./admin-activation";
import { classEnrollmentNotice, type ClassEnrollmentNoticeMailParams } from "./class-enrollment-notice";
import { classInvitation, type ClassInvitationMailParams } from "./class-invitation";
import { invitationManager } from "./invitation-manager";
import { invitationTeacher, type StaffInvitationMailParams } from "./invitation-teacher";
import { layout, type MailContent, type RenderedMail } from "./layout";
import { passwordReset, type PasswordResetMailParams } from "./password-reset";
import { verifyEmail, type VerifyEmailMailParams } from "./verify-email";

/**
 * The transactional e-mails (pt-BR; the six of 017 and the 027 enrollment notice), one source per kind rendered as HTML and text by `layout`
 * (017 research N9). Parameters never include passwords.
 */
export interface TemplateParams {
  "verify-email": VerifyEmailMailParams;
  "password-reset": PasswordResetMailParams;
  "invitation-teacher": StaffInvitationMailParams;
  "invitation-manager": StaffInvitationMailParams;
  "admin-activation": AdminActivationMailParams;
  "class-invitation": ClassInvitationMailParams;
  "class-enrollment-notice": ClassEnrollmentNoticeMailParams;
}

export type TemplateName = keyof TemplateParams;
export type { MailContent, RenderedMail };

const sources: { [K in TemplateName]: (params: TemplateParams[K]) => MailContent } = {
  "verify-email": verifyEmail,
  "password-reset": passwordReset,
  "invitation-teacher": invitationTeacher,
  "invitation-manager": invitationManager,
  "admin-activation": adminActivation,
  "class-invitation": classInvitation,
  "class-enrollment-notice": classEnrollmentNotice,
};

/** What an e-mail says, before the layout. */
export function mailContent<K extends TemplateName>(template: K, params: TemplateParams[K]): MailContent {
  return sources[template](params);
}

export function renderTemplate<K extends TemplateName>(template: K, params: TemplateParams[K]): RenderedMail {
  return layout(mailContent(template, params));
}
