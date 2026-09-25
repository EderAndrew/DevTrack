"use client";

import type { ComponentProps } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldMessage } from "@/components/ui/field-message";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Sample, Showcase } from "./sample";

const FIELD = "w-full max-w-80";

export function InputShowcase() {
  return (
    <Showcase id="input">
      <Sample name="padrão">
        <FormField id="ds-input-padrao" label="Nome da turma" className={FIELD}>
          {(control) => <Input {...control} />}
        </FormField>
      </Sample>
      <Sample name="preenchido">
        <FormField id="ds-input-preenchido" label="Nome da turma" className={FIELD}>
          {(control) => <Input defaultValue="ADS3 — Noite" {...control} />}
        </FormField>
      </Sample>
      <Sample name="desabilitado">
        <FormField id="ds-input-desabilitado" label="Código" className={FIELD}>
          {(control) => <Input defaultValue="2026.2" disabled {...control} />}
        </FormField>
      </Sample>
      <Sample name="erro">
        <FormField id="ds-input-erro" label="E-mail" error="Informe um e-mail válido." className={FIELD}>
          {(control) => <Input type="email" defaultValue="ana@" {...control} />}
        </FormField>
      </Sample>
      <Sample name="sucesso">
        <FormField id="ds-input-sucesso" label="RA" success="RA confirmado." className={FIELD}>
          {(control) => <Input defaultValue="2026001234" {...control} />}
        </FormField>
      </Sample>
    </Showcase>
  );
}

export function TextareaShowcase() {
  return (
    <Showcase id="textarea">
      <Sample name="padrão">
        <FormField id="ds-textarea-padrao" label="Observação" description="Opcional." className={FIELD}>
          {(control) => <Textarea {...control} />}
        </FormField>
      </Sample>
      <Sample name="desabilitado">
        <FormField id="ds-textarea-desabilitado" label="Ementa extraída" className={FIELD}>
          {(control) => <Textarea defaultValue="Conceitos de orientação a objetos." disabled {...control} />}
        </FormField>
      </Sample>
      <Sample name="erro">
        <FormField id="ds-textarea-erro" label="Descrição do tópico" error="Descreva o tópico." className={FIELD}>
          {(control) => <Textarea {...control} />}
        </FormField>
      </Sample>
    </Showcase>
  );
}

const SHIFTS = (
  <>
    <option value="manha">Manhã</option>
    <option value="tarde">Tarde</option>
    <option value="noite">Noite</option>
  </>
);

export function NativeSelectShowcase() {
  return (
    <Showcase id="native-select">
      <Sample name="padrão">
        <FormField id="ds-native-select-padrao" label="Turno" className={FIELD}>
          {(control) => (
            <NativeSelect defaultValue="noite" {...control}>
              {SHIFTS}
            </NativeSelect>
          )}
        </FormField>
      </Sample>
      <Sample name="desabilitado">
        <FormField id="ds-native-select-desabilitado" label="Turno" className={FIELD}>
          {(control) => (
            <NativeSelect defaultValue="manha" disabled {...control}>
              {SHIFTS}
            </NativeSelect>
          )}
        </FormField>
      </Sample>
      <Sample name="erro">
        <FormField id="ds-native-select-erro" label="Turno" error="Escolha o turno." className={FIELD}>
          {(control) => (
            <NativeSelect defaultValue="" {...control}>
              <option value="">Selecione</option>
              {SHIFTS}
            </NativeSelect>
          )}
        </FormField>
      </Sample>
    </Showcase>
  );
}

function RichSelect({ id, label, ...props }: { id: string; label: string; disabled?: boolean; invalid?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select defaultValue="poo" disabled={props.disabled}>
        <SelectTrigger
          id={id}
          className="w-64"
          aria-invalid={props.invalid || undefined}
          aria-describedby={props.invalid ? `${id}-erro` : undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="poo">Programação Orientada a Objetos</SelectItem>
          <SelectItem value="bd">Banco de Dados</SelectItem>
        </SelectContent>
      </Select>
      {props.invalid ? (
        <FieldMessage id={`${id}-erro`} tone="error">
          Escolha outra disciplina.
        </FieldMessage>
      ) : null}
    </div>
  );
}

export function SelectShowcase() {
  return (
    <Showcase id="select">
      <Sample name="padrão">
        <RichSelect id="ds-select-padrao" label="Disciplina" />
      </Sample>
      <Sample name="desabilitado">
        <RichSelect id="ds-select-desabilitado" label="Disciplina" disabled />
      </Sample>
      <Sample name="erro">
        <RichSelect id="ds-select-erro" label="Disciplina" invalid />
      </Sample>
    </Showcase>
  );
}

function Choice({ id, label, ...props }: { id: string; label: string } & ComponentProps<typeof Checkbox>) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} {...props} />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}

export function CheckboxShowcase() {
  return (
    <Showcase id="checkbox">
      <Sample name="desmarcado">
        <Choice id="ds-checkbox-desmarcado" label="Enviar convite agora" />
      </Sample>
      <Sample name="marcado">
        <Choice id="ds-checkbox-marcado" label="Mostrar arquivados" defaultChecked />
      </Sample>
      <Sample name="desabilitado">
        <Choice id="ds-checkbox-desabilitado" label="Tópico concluído" defaultChecked disabled />
      </Sample>
      <Sample name="erro" className="flex-col items-start">
        <Choice
          id="ds-checkbox-erro"
          label="Confirmo que revisei a ementa"
          aria-invalid
          aria-describedby="ds-checkbox-erro-erro"
        />
        <FieldMessage id="ds-checkbox-erro-erro" tone="error">
          Confirme a revisão para continuar.
        </FieldMessage>
      </Sample>
    </Showcase>
  );
}

export function RadioShowcase() {
  return (
    <Showcase id="radio">
      <Sample name="padrão">
        <RadioGroup legend="Ação no tópico">
          <div className="flex items-center gap-2">
            <Radio id="ds-radio-mover" name="ds-radio-acao" value="MOVE" defaultChecked />
            <Label htmlFor="ds-radio-mover">Mover para outra aula</Label>
          </div>
          <div className="flex items-center gap-2">
            <Radio id="ds-radio-arquivar" name="ds-radio-acao" value="ARCHIVE" />
            <Label htmlFor="ds-radio-arquivar">Arquivar</Label>
          </div>
        </RadioGroup>
      </Sample>
      <Sample name="desabilitado">
        <RadioGroup legend="Situação" disabled>
          <div className="flex items-center gap-2">
            <Radio id="ds-radio-ativa" name="ds-radio-situacao" defaultChecked />
            <Label htmlFor="ds-radio-ativa">Ativa</Label>
          </div>
        </RadioGroup>
      </Sample>
    </Showcase>
  );
}

function Toggle({ id, label, ...props }: { id: string; label: string } & ComponentProps<typeof Switch>) {
  return (
    <div className="flex items-center gap-3">
      <Switch id={id} {...props} />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}

export function SwitchShowcase() {
  return (
    <Showcase id="switch">
      <Sample name="desligado">
        <Toggle id="ds-switch-desligado" label="Receber avisos por e-mail" />
      </Sample>
      <Sample name="ligado">
        <Toggle id="ds-switch-ligado" label="Mostrar aulas concluídas" defaultChecked />
      </Sample>
      <Sample name="desabilitado">
        <Toggle id="ds-switch-desabilitado" label="Plano confirmado" defaultChecked disabled />
      </Sample>
    </Showcase>
  );
}

export function LabelShowcase() {
  return (
    <Showcase id="label">
      <Sample name="padrão">
        <Label htmlFor="ds-label-padrao">Nome da disciplina</Label>
        <Input id="ds-label-padrao" className={FIELD} />
      </Sample>
      <Sample name="obrigatório">
        <Label htmlFor="ds-label-obrigatorio" required>
          E-mail
        </Label>
        <Input id="ds-label-obrigatorio" type="email" required className={FIELD} />
      </Sample>
    </Showcase>
  );
}

export function FieldMessageShowcase() {
  return (
    <Showcase id="field-message">
      <Sample name="descrição">
        <FieldMessage id="ds-field-message-descricao">Use o e-mail institucional.</FieldMessage>
      </Sample>
      <Sample name="erro">
        <FieldMessage id="ds-field-message-erro" tone="error">
          Informe o e-mail.
        </FieldMessage>
      </Sample>
      <Sample name="sucesso">
        <FieldMessage id="ds-field-message-sucesso" tone="success">
          E-mail disponível.
        </FieldMessage>
      </Sample>
    </Showcase>
  );
}

export function FormFieldShowcase() {
  return (
    <Showcase id="form-field">
      <Sample name="com descrição">
        <FormField
          id="ds-form-field-descricao"
          label="E-mail do aluno"
          description="O convite chega neste endereço."
          required
          className={FIELD}
        >
          {(control) => <Input type="email" {...control} />}
        </FormField>
      </Sample>
      <Sample name="erro">
        <FormField
          id="ds-form-field-erro"
          label="Data de início"
          error="A data de início vem antes do fim."
          className={FIELD}
        >
          {(control) => <Input type="date" defaultValue="2026-12-01" {...control} />}
        </FormField>
      </Sample>
      <Sample name="sucesso">
        <FormField id="ds-form-field-sucesso" label="RA" success="RA confirmado." className={FIELD}>
          {(control) => <Input defaultValue="2026001234" {...control} />}
        </FormField>
      </Sample>
      <Sample name="desabilitado">
        <FormField id="ds-form-field-desabilitado" label="Turma" description="Definida pelo convite." className={FIELD}>
          {(control) => <Input defaultValue="ADS3 — Noite" disabled {...control} />}
        </FormField>
      </Sample>
    </Showcase>
  );
}
