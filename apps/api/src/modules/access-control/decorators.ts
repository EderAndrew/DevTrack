import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "access:public";

/** Opt-out of the deny-by-default guards: the route needs no session (FR-060, R9). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
