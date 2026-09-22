import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { ErrorBody, ErrorCode } from "@repo/contracts";
import type { Response } from "express";
import { AppException, ErrorCatalog } from "./errors";

/** Framework-level HTTP errors (unknown route, malformed JSON, body too large…) mapped to the catalogue. */
const HTTP_STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: "VALIDATION_ERROR",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  413: "VALIDATION_ERROR",
  415: "VALIDATION_ERROR",
  429: "RATE_LIMITED",
};

/**
 * Single exit point for errors (FR-073): always {statusCode, code, message}, never a stack
 * trace, SQL or infrastructure detail. Unknown errors become 500 INTERNAL_ERROR and are logged.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { body, headers } = this.toResponse(exception);

    if (response.headersSent) return;
    for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
    response.status(body.statusCode).json(body);
  }

  private toResponse(exception: unknown): { body: ErrorBody; headers: Record<string, string> } {
    if (exception instanceof AppException) {
      return { body: exception.toBody(), headers: { ...exception.headers } };
    }

    if (exception instanceof HttpException) {
      const code = HTTP_STATUS_TO_CODE[exception.getStatus()];
      if (code) {
        const { status, message } = ErrorCatalog[code];
        return { body: { statusCode: status, code, message }, headers: {} };
      }
    }

    this.logger.error({ err: exception }, "Unhandled error");
    const { status, message } = ErrorCatalog.INTERNAL_ERROR;
    return { body: { statusCode: status, code: "INTERNAL_ERROR", message }, headers: {} };
  }
}
