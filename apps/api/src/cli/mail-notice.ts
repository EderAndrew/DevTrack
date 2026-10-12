import { runMailNoticeCli } from "./mail-notice.command";

runMailNoticeCli(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch(() => {
    process.stderr.write("Falha ao enviar o aviso.\n");
    process.exit(1);
  });
