import { runAdminBootstrapCli } from "./admin-bootstrap.command";

runAdminBootstrapCli(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch(() => {
    process.stderr.write("Falha no bootstrap administrativo.\n");
    process.exit(1);
  });
