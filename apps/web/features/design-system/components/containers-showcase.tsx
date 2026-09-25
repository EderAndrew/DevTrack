"use client";

import { Ellipsis, Pencil, Trash2 } from "lucide-react";
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
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Sample, Showcase } from "./sample";

export function CardShowcase() {
  return (
    <Showcase id="card">
      <Sample name="agrupamento" className="block">
        <Card className="max-w-120">
          <CardHeader>
            <CardTitle>ADS3 — Noite</CardTitle>
            <CardDescription>Programação Orientada a Objetos · 2026.2</CardDescription>
          </CardHeader>
          <CardContent>32 alunos matriculados, 18 aulas no calendário.</CardContent>
        </Card>
      </Sample>
      <Sample name="com ação" className="block">
        <Card className="max-w-120">
          <CardHeader>
            <CardTitle>Ementa 2026</CardTitle>
            <CardDescription>Revisão pendente</CardDescription>
            <CardAction>
              <Button type="button" size="sm" variant="outline">
                Revisar
              </Button>
            </CardAction>
          </CardHeader>
        </Card>
      </Sample>
    </Showcase>
  );
}

export function DialogShowcase() {
  return (
    <Showcase id="dialog">
      <Sample name="abre pelo botão">
        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" variant="outline">
              <Pencil aria-hidden="true" />
              Renomear tópico
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Renomear tópico</DialogTitle>
              <DialogDescription>O novo nome aparece no plano e no calendário.</DialogDescription>
            </DialogHeader>
            <FormField id="ds-dialog-nome" label="Nome do tópico">
              {(control) => <Input defaultValue="Herança e polimorfismo" {...control} />}
            </FormField>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <DialogClose asChild>
                <Button type="button">Salvar</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Sample>
    </Showcase>
  );
}

export function AlertDialogShowcase() {
  return (
    <Showcase id="alert-dialog">
      <Sample name="confirmação destrutiva">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="danger">
              <Trash2 aria-hidden="true" />
              Remover aluno
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover Ana Souza da turma?</AlertDialogTitle>
              <AlertDialogDescription>
                A matrícula é encerrada. A conta da aluna continua existindo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction variant="danger">Remover aluno</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Sample>
    </Showcase>
  );
}

export function SheetShowcase() {
  return (
    <Showcase id="sheet">
      <Sample name="abre pela lateral">
        <Sheet>
          <SheetTrigger asChild>
            <Button type="button" variant="outline">
              Ver detalhes da aula
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Aula 7 — 14/10</SheetTitle>
              <SheetDescription>Herança e polimorfismo · 2 tópicos</SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>
      </Sample>
    </Showcase>
  );
}

export function PopoverShowcase() {
  return (
    <Showcase id="popover">
      <Sample name="abre pelo botão">
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline">
              Cobertura da ementa
            </Button>
          </PopoverTrigger>
          <PopoverContent>12 de 15 itens da ementa têm tópico no plano.</PopoverContent>
        </Popover>
      </Sample>
    </Showcase>
  );
}

export function DropdownMenuShowcase() {
  return (
    <Showcase id="dropdown-menu">
      <Sample name="abre pelo botão">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="icon" variant="ghost" aria-label="Ações do tópico">
              <Ellipsis aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Tópico</DropdownMenuLabel>
            <DropdownMenuItem>Renomear</DropdownMenuItem>
            <DropdownMenuItem>Mover para outra aula</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="danger">Arquivar tópico</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Sample>
    </Showcase>
  );
}
