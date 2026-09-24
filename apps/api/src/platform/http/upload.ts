import {
  type CallHandler,
  createParamDecorator,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";
import type { Observable } from "rxjs";
import { APP_CONFIG } from "../config/config.module";
import type { AppConfig } from "../config/config.schema";
import { fileTooLarge, validationError } from "./errors";

/** The one file of a syllabus upload, as multer kept it in memory. Nothing is trusted yet. */
export interface UploadedSyllabusFile {
  /** As sent by the client: sanitized later (research E6), never used as a path. */
  originalName: string;
  /** The client's `Content-Type` for the part; compared with the file signature, never trusted. */
  declaredMediaType: string;
  bytes: Buffer;
}

/** What multer (2.x) puts on `req.file` with memory storage; only the fields read here. */
interface MulterMemoryFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

type RequestWithFile = Request & { file?: MulterMemoryFile };

const MIB = 1024 * 1024;

/**
 * Parses `multipart/form-data` with exactly one part, the field `file`, kept in memory (research
 * E5). Limits come from the configuration: more than `SYLLABUS_MAX_FILE_MB` MiB → 413
 * `FILE_TOO_LARGE`; any other field, a second file, a file under another name, a malformed body or
 * no file at all → 400 `VALIDATION_ERROR`. Routes using it also need `@AcceptsMultipart()`.
 */
@Injectable()
export class SyllabusFileInterceptor implements NestInterceptor {
  private readonly multer: NestInterceptor;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    // Without `storage` or `dest`, multer keeps the file in memory (a Buffer).
    const Multer = FileInterceptor("file", {
      limits: { fileSize: config.syllabus.maxFileMb * MIB, files: 1, fields: 0, parts: 1 },
      // Browsers send the file name as raw UTF-8; busboy's default (latin1) would garble accents.
      defParamCharset: "utf8",
    });
    this.multer = new Multer();
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<RequestWithFile>();
    const requireFile: CallHandler = {
      handle: () => {
        if (!req.file) throw validationError();
        return next.handle();
      },
    };
    try {
      return await this.multer.intercept(context, requireFile);
    } catch (error) {
      throw uploadError(error);
    }
  }
}

/**
 * Multer and busboy errors in the API's catalogue; anything else was not caused by the body.
 * Nest translates multer errors by message, and the messages changed in multer 2.4 (pinned by the
 * security override): untranslated `MulterError`s are mapped by their stable `code`.
 */
function uploadError(error: unknown): unknown {
  if (error instanceof Error && error.name === "MulterError") {
    return (error as Error & { code?: string }).code === "LIMIT_FILE_SIZE" ? fileTooLarge() : validationError();
  }
  if (error instanceof HttpException) {
    if (error.getStatus() === HttpStatus.PAYLOAD_TOO_LARGE) return fileTooLarge();
    if (error.getStatus() === HttpStatus.BAD_REQUEST) return validationError();
    return error;
  }
  // Busboy errors that Nest does not translate (e.g. a truncated part) are malformed bodies too.
  if (error instanceof Error && /^(Multipart|Malformed|Unexpected end)/i.test(error.message)) return validationError();
  return error;
}

/** The file parsed by `SyllabusFileInterceptor`, for the controller of an upload route. */
export const SyllabusFile = createParamDecorator((_data: unknown, context: ExecutionContext): UploadedSyllabusFile => {
  const file = context.switchToHttp().getRequest<RequestWithFile>().file;
  if (!file) throw validationError();
  return { originalName: file.originalname, declaredMediaType: file.mimetype, bytes: file.buffer };
});
