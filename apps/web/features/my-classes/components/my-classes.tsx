"use client";

import { Notice } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/messages/dates";
import { messageForError } from "@/lib/messages/error-messages";
import { useMyClasses } from "../hooks/use-my-classes";

export interface MyClassesProps {
  /** Arrived from an accepted class invitation (`?bem-vindo=1`, FR-038). */
  welcome: boolean;
}

/**
 * "Minhas turmas" (003 US7): the classes of the student's active enrollments, most recent first,
 * as the API orders them. Only the class and its teacher; nothing about other students.
 */
export function MyClasses({ welcome }: MyClassesProps) {
  const classes = useMyClasses();
  const items = classes.data?.items ?? [];

  return (
    <div>
      {welcome ? (
        <Notice role="status">
          <h2>Você agora faz parte da turma.</h2>
        </Notice>
      ) : null}

      {classes.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">Carregando turmas…</span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : classes.isError ? (
        <div role="alert">
          <p>{messageForError(classes.error)}</p>
          <Button type="button" variant="secondary" onClick={() => void classes.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p>Você ainda não participa de nenhuma turma.</p>
      ) : (
        <Table>
          <TableCaption className="sr-only">Turmas de que você participa</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Turma</TableHead>
              <TableHead scope="col">Código</TableHead>
              <TableHead scope="col">Ano</TableHead>
              <TableHead scope="col">Período</TableHead>
              <TableHead scope="col">Professor</TableHead>
              <TableHead scope="col">Entrada</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.code}</TableCell>
                <TableCell>{item.academicYear}</TableCell>
                <TableCell>{item.period ?? "—"}</TableCell>
                <TableCell>{item.teacherName}</TableCell>
                <TableCell>{formatDateTime(item.enrolledAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
