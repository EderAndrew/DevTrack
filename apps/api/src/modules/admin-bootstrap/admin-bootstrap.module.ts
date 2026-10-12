import { Module } from "@nestjs/common";
import { ProvisioningModule } from "../provisioning/provisioning.module";
import { AdminActivationController } from "./admin-activation.controller";
import { AdminActivationService } from "./admin-activation.service";
import { AdminBootstrapMailSubject } from "./admin-bootstrap.mail-subject";
import { AdminBootstrapService } from "./admin-bootstrap.service";

/** First-ADMIN bootstrap: the operational command's service and the activation routes (R14). */
@Module({
  imports: [ProvisioningModule],
  controllers: [AdminActivationController],
  providers: [AdminBootstrapService, AdminActivationService, AdminBootstrapMailSubject],
  exports: [AdminBootstrapService],
})
export class AdminBootstrapModule {}
