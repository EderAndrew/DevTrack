/** Links of the e-mails, pointing at the web app (R18). */
export function webLinks(webOrigin: string) {
  return {
    verifyEmail: (token: string) => `${webOrigin}/verificar-email?token=${encodeURIComponent(token)}`,
    login: `${webOrigin}/entrar`,
    passwordReset: `${webOrigin}/esqueci-senha`,
    passwordResetConfirm: (token: string) => `${webOrigin}/redefinir-senha?token=${encodeURIComponent(token)}`,
    invitation: (token: string) => `${webOrigin}/convite?token=${encodeURIComponent(token)}`,
    adminActivation: (token: string) => `${webOrigin}/ativar-admin?token=${encodeURIComponent(token)}`,
    classInvitation: (token: string) => `${webOrigin}/convite-turma?token=${encodeURIComponent(token)}`,
  };
}
