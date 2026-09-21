import { runMaintenanceCli } from "./maintenance.command";

runMaintenanceCli(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch(() => {
    process.stderr.write("Falha na manutenção.\n");
    process.exit(1);
  });
