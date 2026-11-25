"use client";

import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { messageForError } from "@/lib/messages/error-messages";
import { useMyClasses } from "../hooks/use-my-classes";
import { useMyClassesFilters } from "../hooks/use-my-classes-filters";
import {
  ALL_CLASSES_TAB,
  ALL_YEARS,
  ALL_YEARS_LABEL,
  CLEAR_FILTERS,
  filterSubjectCards,
  FOOTER_ORDER,
  footerText,
  NO_CLASSES,
  NO_RESULTS,
  PAGE_SUBTITLE,
  PAGE_TITLE,
  SEARCH_LABEL,
  SEARCH_MAX,
  SEARCH_WAIT_MS,
  studentYears,
  subjectCards,
  YEAR_LABEL,
  type YearChoice,
} from "../schemas/my-classes";
import { AcademicYearCard } from "./academic-year-card";
import { SubjectCard } from "./subject-card";

export interface MyClassesProps {
  /** Arrived from an accepted class invitation (`?bem-vindo=1`, FR-038). */
  welcome: boolean;
  /** Holds `ranking.turma.visualizar`: each disciplina shows the "Ranking da turma" panel (013/FR-021). */
  showRanking?: boolean;
}

const SEARCH_ID = "minhas-turmas-busca";
const YEAR_ID = "minhas-turmas-ano";
const TAB = "todas";

/**
 * The search box (030/US2-3): its own text, applied (`onApply`) `SEARCH_WAIT_MS` after typing stops or at once on
 * Enter. A search changed from outside (the address, "Limpar busca e filtro") replaces the text.
 */
function ClassesSearch({ value, onApply }: { value: string; onApply: (text: string) => void }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (value !== seen) {
    setSeen(value);
    if (text.trim() !== value) setText(value);
  }
  const stop = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  return (
    <form
      role="search"
      className="relative w-full md:w-72"
      onSubmit={(event) => {
        event.preventDefault();
        stop();
        onApply(text);
      }}
    >
      <Label htmlFor={SEARCH_ID} className="sr-only">
        {SEARCH_LABEL}
      </Label>
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-secondary" />
      <Input
        id={SEARCH_ID}
        type="search"
        className="pl-10"
        maxLength={SEARCH_MAX}
        placeholder={SEARCH_LABEL}
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          stop();
          timer.current = setTimeout(() => {
            timer.current = null;
            onApply(next);
          }, SEARCH_WAIT_MS);
        }}
      />
    </form>
  );
}

/** The "Ano" filter (030/US2-2): the student's years, most recent first, then "Todos os anos". */
function YearFilter({ years, value, onChange }: { years: readonly number[]; value: YearChoice; onChange: (choice: YearChoice) => void }) {
  return (
    <div className="w-full md:w-44">
      <Label htmlFor={YEAR_ID} className="sr-only">
        {YEAR_LABEL}
      </Label>
      <NativeSelect
        id={YEAR_ID}
        className="w-full"
        value={String(value)}
        onChange={(event) => onChange(event.target.value === ALL_YEARS ? ALL_YEARS : Number(event.target.value))}
      >
        {years.map((year) => (
          <option key={year} value={year}>
            {`${YEAR_LABEL}: ${year}`}
          </option>
        ))}
        <option value={ALL_YEARS}>{ALL_YEARS_LABEL}</option>
      </NativeSelect>
    </div>
  );
}

/**
 * "Minhas turmas" (003 US7, 027 US8, redesigned by 030): the page header with the "Ano letivo" card and one card per
 * disciplina da turma of the student's active enrollments, in the API's order (most recent ano letivo, then the most
 * recent enrollment). The header lives here because the year comes from the list (030 research MT6). Since 030/US2 the
 * year (the most recent at first, or "Todos os anos") and the search narrow the list in the browser, both in the
 * address (`?ano=&busca=`), with the tab's count and the footer; the list is asked for once. A closed turma or an
 * archived disciplina says so in words and stays readable. Nothing about other students.
 */
export function MyClasses({ welcome, showRanking = false }: MyClassesProps) {
  const query = useMyClasses();
  const cards = subjectCards(query.data);
  const years = studentYears(query.data);
  const filters = useMyClassesFilters(years);
  const year = filters.year;
  const shownYear = year === ALL_YEARS ? years[0] : (year ?? undefined);
  const ofYear = year === null ? [] : filterSubjectCards(cards, { year, search: "" });
  const shown = year === null ? [] : filterSubjectCards(cards, { year, search: filters.search });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={PAGE_TITLE}
        description={PAGE_SUBTITLE}
        actions={shownYear !== undefined ? <AcademicYearCard year={shownYear} /> : undefined}
        className="mb-0"
      />

      {welcome ? (
        <Notice role="status">
          <h2>Você agora faz parte da turma.</h2>
        </Notice>
      ) : null}

      {query.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-4">
          <span className="sr-only">Carregando turmas…</span>
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : query.isError ? (
        <div role="alert">
          <p>{messageForError(query.error)}</p>
          <Button type="button" variant="secondary" onClick={() => void query.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : cards.length === 0 || year === null ? (
        <p>{NO_CLASSES}</p>
      ) : (
        <Tabs value={TAB}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <TabsList aria-label="Turmas">
              <TabsTrigger value={TAB} aria-label={`${ALL_CLASSES_TAB}, ${ofYear.length}`}>
                {ALL_CLASSES_TAB}
                <Badge aria-hidden="true">{ofYear.length}</Badge>
              </TabsTrigger>
            </TabsList>
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <ClassesSearch value={filters.search} onApply={filters.setSearch} />
              <YearFilter years={years} value={year} onChange={filters.setYear} />
            </div>
          </div>
          <TabsContent value={TAB} className="flex flex-col gap-6">
            {shown.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <p className="m-0 text-text-secondary">{NO_RESULTS}</p>
                <Button type="button" variant="secondary" onClick={filters.clear}>
                  {CLEAR_FILTERS}
                </Button>
              </div>
            ) : (
              shown.map((card) => <SubjectCard key={card.key} card={card} showRanking={showRanking} />)
            )}
            <div className="flex flex-col gap-1 text-body-sm text-text-secondary sm:flex-row sm:justify-between">
              <p className="m-0" aria-live="polite">
                {footerText(shown.length, ofYear.length)}
              </p>
              <p className="m-0">{FOOTER_ORDER}</p>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
