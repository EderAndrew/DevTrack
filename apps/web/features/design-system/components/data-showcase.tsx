"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { Status } from "@/components/ui/status";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sample, Showcase } from "./sample";

const STUDENTS = [
  ["Ana Souza", "2026001234", "Matriculada"],
  ["Bruno Lima", "2026001235", "Convite pendente"],
  ["Carla Dias", "2026001236", "Matriculada"],
] as const;

export function TableShowcase() {
  return (
    <Showcase id="table">
      {(["comfortable", "compact"] as const).map((density) => (
        <Sample key={density} name={density} className="block">
          <Table density={density}>
            <TableCaption>Alunos da turma ADS3 — Noite</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>RA</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {STUDENTS.map(([name, ra, status]) => (
                <TableRow key={ra}>
                  <TableCell>{name}</TableCell>
                  <TableCell>{ra}</TableCell>
                  <TableCell>{status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Sample>
      ))}
    </Showcase>
  );
}

function PaginationSample({ start }: { start: number }) {
  const [page, setPage] = useState(start);
  return <Pagination page={page} totalPages={12} onPageChange={setPage} />;
}

export function PaginationShowcase() {
  return (
    <Showcase id="pagination">
      <Sample name="primeira página">
        <PaginationSample start={1} />
      </Sample>
      <Sample name="página do meio">
        <PaginationSample start={6} />
      </Sample>
      <Sample name="última página">
        <PaginationSample start={12} />
      </Sample>
    </Showcase>
  );
}

const MEANINGS = [
  ["neutral", "Rascunho"],
  ["info", "Em revisão"],
  ["success", "Confirmado"],
  ["warning", "Pendente"],
  ["danger", "Falhou"],
] as const;

export function BadgeShowcase() {
  return (
    <Showcase id="badge">
      {MEANINGS.map(([variant, label]) => (
        <Sample key={variant} name={variant}>
          <Badge variant={variant}>{label}</Badge>
        </Sample>
      ))}
    </Showcase>
  );
}

export function StatusShowcase() {
  return (
    <Showcase id="status">
      {MEANINGS.map(([variant, label]) => (
        <Sample key={variant} name={variant}>
          <Status variant={variant}>{label}</Status>
        </Sample>
      ))}
    </Showcase>
  );
}

export function TabsShowcase() {
  return (
    <Showcase id="tabs">
      <Sample name="padrão" className="block">
        <Tabs defaultValue="itens">
          <TabsList aria-label="Ementa">
            <TabsTrigger value="itens">Itens</TabsTrigger>
            <TabsTrigger value="texto">Texto extraído</TabsTrigger>
          </TabsList>
          <TabsContent value="itens">15 itens em 4 grupos.</TabsContent>
          <TabsContent value="texto">Texto original do documento enviado.</TabsContent>
        </Tabs>
      </Sample>
      <Sample name="desabilitado" className="block">
        <Tabs defaultValue="alunos">
          <TabsList aria-label="Turma">
            <TabsTrigger value="alunos">Alunos</TabsTrigger>
            <TabsTrigger value="avaliacoes" disabled>
              Avaliações
            </TabsTrigger>
          </TabsList>
          <TabsContent value="alunos">32 alunos matriculados.</TabsContent>
        </Tabs>
      </Sample>
    </Showcase>
  );
}
