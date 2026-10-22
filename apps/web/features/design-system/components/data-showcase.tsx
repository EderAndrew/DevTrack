"use client";

import { Ban, CircleCheck, CircleX, TimerOff } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent, seriesColor } from "@/components/ui/chart";
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

const SINGLE = { calls: { label: "Chamadas", color: "var(--chart-1)" } } satisfies ChartConfig;
const OUTCOMES = {
  completed: { label: "Concluídas", color: "var(--success)", icon: CircleCheck },
  failed: { label: "Falhas", color: "var(--danger)", icon: CircleX },
  timedOut: { label: "Tempo esgotado", color: "var(--warning)", icon: TimerOff },
  cancelled: { label: "Canceladas", color: "var(--text-secondary)", icon: Ban },
} satisfies ChartConfig;
const CHART_DATA = [
  { name: "Turma A", calls: 42, completed: 30, failed: 4, timedOut: 2, cancelled: 1 },
  { name: "Turma B", calls: 27, completed: 18, failed: 1, timedOut: 0, cancelled: 3 },
  { name: "Turma C", calls: 12, completed: 9, failed: 2, timedOut: 1, cancelled: 0 },
];

export function ChartShowcase() {
  return (
    <Showcase id="chart">
      <Sample name="série única" className="block">
        <ChartContainer config={SINGLE} height={168}>
          <BarChart data={CHART_DATA} layout="vertical">
            <CartesianGrid horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" width={80} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="calls" fill={seriesColor("calls")} radius={[0, 4, 4, 0]} isAnimationActive={false} />
          </BarChart>
        </ChartContainer>
      </Sample>
      <Sample name="séries de situação" className="block">
        <ChartContainer config={OUTCOMES} height={168}>
          <BarChart data={CHART_DATA} layout="vertical">
            <CartesianGrid horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" width={80} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            {(Object.keys(OUTCOMES) as (keyof typeof OUTCOMES)[]).map((key) => (
              <Bar key={key} dataKey={key} stackId="a" fill={seriesColor(key)} stroke="var(--background)" strokeWidth={2} isAnimationActive={false} />
            ))}
          </BarChart>
        </ChartContainer>
      </Sample>
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
