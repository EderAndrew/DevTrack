import { Controller, Put } from "@nestjs/common";
import { type MobileDevice, type RegisterMobileDeviceRequest, RegisterMobileDeviceRequestSchema } from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody } from "../../platform/http/zod-validation.pipe";
import { MobileAccess, RequirePermissions } from "../access-control/decorators";
import { MobileDevicesService } from "./mobile-devices.service";

/** 024/US1: the phone registers for alerts (contracts/http-api.md). */
@Controller("mobile/device")
export class MobileDevicesController {
  constructor(private readonly devices: MobileDevicesService) {}

  @Put()
  @RequirePermissions("chamada.registrar")
  @MobileAccess()
  register(@ZodBody(RegisterMobileDeviceRequestSchema) body: RegisterMobileDeviceRequest, @Ctx() ctx: RequestContext): Promise<MobileDevice> {
    return this.devices.register(ctx.auth!, body, ctx.requestId);
  }
}
