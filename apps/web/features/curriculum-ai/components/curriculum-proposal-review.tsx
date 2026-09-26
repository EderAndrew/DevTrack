"use client";

import type {
  AiProposalView,
  CurriculumProposalContent,
  CurriculumReviewWarningCode,
  SyllabusDocumentDetail,
} from "@repo/contracts";
import { Download } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useRef, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { AiProposalStatus } from "@/components/shared/ai";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDecideAiProposal } from "@/features/ai/hooks/use-decide-ai-proposal";
import { syllabusDocumentsApi } from "@/features/syllabus/api/syllabus-documents";
import { SyllabusContent } from "@/features/syllabus/components/syllabus-content";
import { syllabusDocumentHref } from "@/features/syllabus/components/syllabus-versions-list";
import { useSyllabusDocument } from "@/features/syllabus/hooks/use-syllabus-documents";
import { apiErrorCode, ERROR_MESSAGES, messageForError } from "@/lib/messages/error-messages";
import { useApplyCurriculumProposal } from "../hooks/use-apply-curriculum-proposal";
import { useCurriculumProposal } from "../hooks/use-curriculum-proposal";
import { firstInvalidItem } from "../schemas/accepted-draft";
import { CurriculumWarning } from "./curriculum-warning";
import { SourceRef } from "./source-ref";

const FIELDS = [
  ["title", "Nome da disciplina"],
  ["syllabusText", "Ementa"],
  ["competencyText", "Competência"],
] as const;
type FieldName = (typeof FIELDS)[number][0];

const NOT_IDENTIFIED = "Não identificado no documento";

export interface CurriculumProposalReviewProps {
  subjectId: string;
  documentId: string;
  proposalId: string;
}

/**
 * The proposal page (007/US3, contracts/web-ui.md): the original document next to the proposal,
 * read-only, with a checkbox per identified field and group. "Aplicar à ementa" turns the checked
 * items into the document's 004 draft; nothing of the proposal is editable here (FR-027).
 */
export function CurriculumProposalReview({ subjectId, documentId, proposalId }: CurriculumProposalReviewProps) {
  const proposal = useCurriculumProposal(proposalId);
  const document = useSyllabusDocument(documentId);
  const back = <Link href={syllabusDocumentHref(subjectId, documentId)}>Voltar para a ementa</Link>;

  if (proposal.isPending || document.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-2">
        <span className="sr-only">Carregando proposta…</span>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  const failure = proposal.isError ? proposal.error : document.isError ? document.error : null;
  const mismatch =
    !proposal.content || proposal.data?.target.id !== documentId || document.data?.subjectId !== subjectId;
  if (failure || mismatch) {
    return (
      <div role="alert">
        <p>{failure ? messageForError(failure) : ERROR_MESSAGES.NOT_FOUND}</p>
        <p>{back}</p>
      </div>
    );
  }
  return (
    <ProposalReview
      key={proposal.data!.id}
      subjectId={subjectId}
      document={document.data!}
      proposal={proposal.data!}
      content={proposal.content!}
      back={back}
    />
  );
}

interface ProposalReviewProps {
  subjectId: string;
  document: SyllabusDocumentDetail;
  proposal: AiProposalView;
  content: CurriculumProposalContent;
  back: ReactNode;
}

function ProposalReview({ subjectId, document, proposal, content, back }: ProposalReviewProps) {
  const id = useId();
  const router = useRouter();
  const [now] = useState(() => Date.now());
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set(proposal.itemIds));
  const [invalidItem, setInvalidItem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState("");
  const controls = useRef(new Map<string, HTMLInputElement>());
  const apply = useApplyCurriculumProposal(subjectId, document.id, proposal.id);
  const decide = useDecideAiProposal(proposal.id);

  const { extraction, grounding } = content;
  const documentHref = syllabusDocumentHref(subjectId, document.id);
  const reviewing = proposal.status === "READY_FOR_REVIEW" && new Date(proposal.expiresAt).getTime() > now;
  const shownStatus = proposal.status === "READY_FOR_REVIEW" && !reviewing ? "EXPIRED" : proposal.status;
  const selected = proposal.itemIds.filter((itemId) => checked.has(itemId));
  const busy = apply.isPending || decide.isPending;
  const draft = document.revisions.find((revision) => revision.aiProposalId === proposal.id);

  const anchor = (kind: string, ...indexes: (string | number)[]) => `${id}-${kind}-${indexes.join("-")}`;
  const unsupported = grounding.unsupported;
  const firstUnsupported = unsupported[0];
  const firstAnchor = firstUnsupported
    ? firstUnsupported.field === "item"
      ? anchor("item", firstUnsupported.groupIndex ?? 0, firstUnsupported.itemIndex ?? 0)
      : firstUnsupported.field === "groupTitle"
        ? anchor("grupo", firstUnsupported.groupIndex ?? 0)
        : anchor("campo", firstUnsupported.field)
    : null;

  const fieldWarnings = (name: FieldName): CurriculumReviewWarningCode[] => [
    ...(unsupported.some((flag) => flag.field === name) ? (["UNSUPPORTED_CONTENT"] as const) : []),
    ...extraction.warnings
      .filter((warning) => warning.field === name && warning.groupIndex === null)
      // A field not found already says so in place of its text.
      .filter((warning) => !(warning.code === "FIELD_NOT_FOUND" && extraction[name] === null))
      .map((warning) => warning.code),
  ];
  const groupWarnings = (index: number): CurriculumReviewWarningCode[] => [
    ...(unsupported.some((flag) => flag.field === "groupTitle" && flag.groupIndex === index) ? (["UNSUPPORTED_CONTENT"] as const) : []),
    ...extraction.warnings.filter((warning) => warning.groupIndex === index).map((warning) => warning.code),
  ];
  const generalWarnings = extraction.warnings.filter(
    (warning) => warning.groupIndex === null && (warning.field === null || warning.field === "groups"),
  );

  const toggle = (itemId: string, on: boolean) => {
    setInvalidItem(null);
    setError("");
    setChecked((current) => {
      const next = new Set(current);
      if (on) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  };

  const startApply = () => {
    setError("");
    // The API's own check (US3-8), first here, so the teacher sees which item to uncheck.
    const invalid = firstInvalidItem(extraction, new Set(selected));
    setInvalidItem(invalid);
    if (invalid) {
      controls.current.get(invalid)?.focus();
      return;
    }
    setConfirming(true);
  };

  const send = (replaceDraft: boolean) => {
    if (apply.isPending) return;
    setError("");
    apply.mutate(
      { acceptedItemIds: selected, replaceDraft },
      {
        onSuccess: () => router.push(documentHref),
        onError: (failure) => {
          if (!replaceDraft && apiErrorCode(failure) === "REVISION_DRAFT_EXISTS") setReplacing(true);
          else setError(messageForError(failure));
        },
      },
    );
  };

  const reject = () =>
    decide.mutate({ decision: "REJECT" }, { onSuccess: () => router.push(documentHref), onError: (failure) => setError(messageForError(failure)) });

  /** A checkbox and its label while reviewing; the label alone once decided. */
  const choice = (itemId: string, label: string, anchorId: string, describedBy?: string) => {
    const inputId = `${id}-${itemId}`;
    const errorId = `${inputId}-erro`;
    const invalid = invalidItem === itemId;
    if (!reviewing) {
      return (
        <span id={anchorId} className="text-label">
          {label}
        </span>
      );
    }
    return (
      <div className="flex items-start gap-3">
        <Checkbox
          id={inputId}
          ref={(node) => {
            if (node) controls.current.set(itemId, node);
            else controls.current.delete(itemId);
          }}
          checked={checked.has(itemId)}
          disabled={busy}
          aria-invalid={invalid || undefined}
          aria-describedby={[invalid ? errorId : null, describedBy].filter(Boolean).join(" ") || undefined}
          onChange={(event) => toggle(itemId, event.target.checked)}
          className="mt-px"
        />
        <div className="flex flex-col gap-1">
          <Label id={anchorId} htmlFor={inputId}>
            {label}
          </Label>
          {invalid ? (
            <p id={errorId} className="m-0 text-body-sm font-semibold text-danger-text">
              {ERROR_MESSAGES.CURRICULUM_PROPOSAL_INVALID}
            </p>
          ) : null}
        </div>
      </div>
    );
  };

  const proposalPanel = (
    <section aria-labelledby={`${id}-proposta`} className="flex flex-col gap-4">
      <h2 id={`${id}-proposta`} className="m-0">
        Proposta
      </h2>
      {unsupported.length > 0 && firstAnchor ? (
        <p className="m-0">
          <a href={`#${firstAnchor}`}>
            {unsupported.length === 1 ? "1 item sem correspondência no documento" : `${unsupported.length} itens sem correspondência no documento`}
          </a>
        </p>
      ) : null}
      {generalWarnings.length > 0 ? (
        <div className="flex flex-col gap-1">
          {generalWarnings.map((warning, index) => (
            <CurriculumWarning key={index} code={warning.code} />
          ))}
        </div>
      ) : null}

      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {FIELDS.map(([name, label]) => {
          const value = extraction[name];
          const anchorId = anchor("campo", name);
          const textId = `${anchorId}-texto`;
          return (
            <li key={name} className="flex flex-col gap-1">
              {value === null || !proposal.itemIds.includes(name) ? (
                <>
                  <span id={anchorId} className="text-label">
                    {label}
                  </span>
                  <p className="m-0 text-text-secondary">{NOT_IDENTIFIED}</p>
                </>
              ) : (
                <>
                  {choice(name, label, anchorId, textId)}
                  <p id={textId} className="m-0 whitespace-pre-line">
                    {value}
                  </p>
                </>
              )}
              {fieldWarnings(name).map((code) => (
                <CurriculumWarning key={code} code={code} />
              ))}
            </li>
          );
        })}
      </ul>

      <h3 className="m-0">Objetos de aprendizagem</h3>
      {extraction.groups.length === 0 ? (
        <p className="m-0 text-text-secondary">{NOT_IDENTIFIED}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {extraction.groups.map((group, groupIndex) => (
            <li key={groupIndex} className="flex flex-col gap-1">
              {choice(`group:${groupIndex}`, group.title ?? "Grupo sem título", anchor("grupo", groupIndex))}
              {groupWarnings(groupIndex).map((code, index) => (
                <CurriculumWarning key={index} code={code} />
              ))}
              <ol className="m-0">
                {group.items.map((item, itemIndex) => (
                  <li key={itemIndex} id={anchor("item", groupIndex, itemIndex)}>
                    {item.text} {item.sourceRef ? <SourceRef sourceRef={item.sourceRef} /> : null}
                    {unsupported.some((flag) => flag.field === "item" && flag.groupIndex === groupIndex && flag.itemIndex === itemIndex) ? (
                      <CurriculumWarning code="UNSUPPORTED_CONTENT" />
                    ) : null}
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const documentPanel = (
    <section aria-labelledby={`${id}-documento`} className="flex flex-col gap-4">
      <h2 id={`${id}-documento`} className="m-0">
        Documento
      </h2>
      <div>
        <Button asChild variant="secondary">
          <a href={syllabusDocumentsApi.fileUrl(document.id)} download>
            <Download aria-hidden="true" />
            Baixar original
          </a>
        </Button>
      </div>
      {document.extraction ? (
        <SyllabusContent content={document.extraction} kind="extraction" />
      ) : (
        <p className="m-0">O texto do documento não está disponível.</p>
      )}
    </section>
  );

  return (
    <div>
      <p className="mt-0">{back}</p>
      <PageHeader
        title="Proposta da IA para a ementa"
        status={<AiProposalStatus status={shownStatus} />}
        description={`Ementa — versão ${document.version} (${document.originalFilename})`}
      />
      <Alert variant="info" role={undefined} className="mb-6">
        <AlertDescription>
          Sugestão gerada por IA a partir do documento. Revise antes de aplicar; você ainda poderá editar e confirmar a ementa depois.
        </AlertDescription>
      </Alert>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {reviewing ? (
          <>
            <Button type="button" disabled={selected.length === 0 || busy} aria-busy={apply.isPending || undefined} onClick={startApply}>
              Aplicar à ementa
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="danger" disabled={busy}>
                  Rejeitar proposta
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Rejeitar a proposta?</AlertDialogTitle>
                  <AlertDialogDescription>Nenhum item será aplicado e a ementa não muda.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction variant="danger" onClick={reject}>
                    Rejeitar proposta
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : draft ? (
          <Button asChild variant="secondary">
            <Link href={documentHref}>Abrir rascunho</Link>
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="font-semibold text-danger-text">
          {error}
        </p>
      ) : null}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar à ementa?</AlertDialogTitle>
            <AlertDialogDescription>
              Um rascunho da ementa será criado com os itens marcados. Você poderá editá-lo e deverá confirmá-lo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => send(false)}>Aplicar à ementa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={replacing} onOpenChange={setReplacing}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Substituir o rascunho?</AlertDialogTitle>
            <AlertDialogDescription>Já existe um rascunho desta ementa. Substituí-lo pelo conteúdo da proposta?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter rascunho</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={() => send(true)}>
              Substituir rascunho
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Tabs defaultValue="proposta">
        <TabsList aria-label="Documento e proposta" className="md:hidden">
          <TabsTrigger value="documento">Documento</TabsTrigger>
          <TabsTrigger value="proposta">Proposta</TabsTrigger>
        </TabsList>
        {/* From `md`, both panels side by side; below it, one at a time through the tabs. */}
        <div className="grid gap-8 md:grid-cols-2">
          <TabsContent value="documento" forceMount className="data-[state=inactive]:hidden md:data-[state=inactive]:block">
            {documentPanel}
          </TabsContent>
          <TabsContent value="proposta" forceMount className="data-[state=inactive]:hidden md:data-[state=inactive]:block">
            {proposalPanel}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
