"use client";

import type { SyllabusUploadResult } from "@repo/contracts";
import { Upload } from "lucide-react";
import { type DragEvent, useId, useRef, useState } from "react";
import { Notice } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ERROR_MESSAGES, messageForError } from "@/lib/messages/error-messages";
import { cn } from "@/lib/utils";
import { useUploadSyllabus } from "../hooks/use-syllabus-documents";

/** What the file input offers; the server decides by the content (research E6). */
export const SYLLABUS_ACCEPT = ".pdf,.docx,.png,.jpg,.jpeg";
const EXTENSIONS = SYLLABUS_ACCEPT.split(",");
/** Same limit as the API (`SYLLABUS_MAX_FILE_MB`); the check here only saves a useless upload. */
export const SYLLABUS_MAX_BYTES = 10 * 1024 * 1024;

/** Refusal before sending (UX only): wrong extension or too large. */
export function clientRejection(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!EXTENSIONS.some((extension) => name.endsWith(extension))) return ERROR_MESSAGES.FILE_TYPE_NOT_ALLOWED;
  if (file.size > SYLLABUS_MAX_BYTES) return ERROR_MESSAGES.FILE_TOO_LARGE;
  return null;
}

export interface SyllabusUploadProps {
  subjectId: string;
  /** After the server accepted the file (a new version or an existing one). */
  onUploaded?: (result: SyllabusUploadResult) => void;
}

/**
 * "Enviar ementa" (004/US2, contracts/web-ui.md): choose or drop one file, see the progress,
 * then "Ementa enviada." or "Este arquivo já foi enviado (versão N).".
 */
export function SyllabusUpload({ subjectId, onUploaded }: SyllabusUploadProps) {
  const inputId = useId();
  const hintId = useId();
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadSyllabus(subjectId);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const choose = (chosen: File | undefined) => {
    setNotice("");
    if (!chosen) return;
    const rejection = clientRejection(chosen);
    setError(rejection ?? "");
    setFile(rejection ? null : chosen);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files[0]);
  };

  const send = () => {
    if (!file || upload.isPending) return;
    setError("");
    setProgress(0);
    upload.mutate(
      { file, onProgress: setProgress },
      {
        onSuccess: (result) => {
          setNotice(
            result.duplicate ? `Este arquivo já foi enviado (versão ${result.document.version}).` : "Ementa enviada.",
          );
          setFile(null);
          if (input.current) input.current.value = "";
          onUploaded?.(result);
        },
        onError: (failure) => setError(messageForError(failure)),
        onSettled: () => setProgress(null),
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {notice ? <Notice role="status">{notice}</Notice> : null}
      {error ? (
        <p role="alert" className="m-0 font-semibold text-destructive">
          {error}
        </p>
      ) : null}
      <div
        data-testid="area-de-envio"
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col gap-2 rounded-md border-2 border-dashed border-border p-4",
          dragging && "border-primary bg-primary/5",
        )}
      >
        <Label htmlFor={inputId}>Arquivo da ementa</Label>
        <p id={hintId} className="m-0 text-sm text-muted-foreground">
          PDF, DOCX, PNG ou JPG, até 10 MB. Você também pode soltar o arquivo aqui.
        </p>
        <input
          ref={input}
          id={inputId}
          type="file"
          accept={SYLLABUS_ACCEPT}
          aria-describedby={hintId}
          disabled={upload.isPending}
          onChange={(event) => choose(event.target.files?.[0])}
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:font-medium"
        />
        {file ? <p className="m-0 text-sm">Arquivo escolhido: {file.name}</p> : null}
      </div>
      {progress !== null ? (
        <Progress value={progress} aria-label="Progresso do envio" aria-valuetext={`${progress}%`} />
      ) : null}
      <div>
        <Button type="button" onClick={send} disabled={!file} aria-busy={upload.isPending || undefined}>
          <Upload aria-hidden="true" />
          Enviar ementa
        </Button>
      </div>
    </div>
  );
}
