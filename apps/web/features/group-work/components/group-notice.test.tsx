import type { StudentGroup } from "@repo/contracts";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { GroupBar } from "./group-bar";
import { GroupNotice } from "./group-notice";

const ANA = { id: "cccccccc-0000-4000-8000-000000000001", name: "Ana Souza" };
const BRUNO = { id: "cccccccc-0000-4000-8000-000000000002", name: "Bruno Lima" };
const CARLA = { id: "cccccccc-0000-4000-8000-000000000003", name: "Carla Dias" };

const group = (overrides: Partial<StudentGroup> = {}): StudentGroup => ({
  groupSize: 4,
  leader: ANA,
  members: [ANA, BRUNO, CARLA],
  editor: ANA,
  myRole: "MEMBER",
  canEdit: false,
  addedBy: ANA,
  freeSlots: 1,
  version: 1,
  ...overrides,
});

describe("023/US3 aviso e barra do grupo", () => {
  it("023/US3-1 o integrante vê o aviso do grupo do líder, os integrantes e quem edita num role=status", async () => {
    const { container } = renderWithProviders(
      <>
        <GroupNotice group={group()} />
        <GroupBar activityId="bbbbbbbb-0000-4000-8000-000000000001" open={false} group={group()} />
      </>,
    );
    expect(screen.getByText("Você está no grupo de Ana Souza neste trabalho.")).toBeTruthy();
    expect(screen.getByText("Ana Souza (líder), Bruno Lima, Carla Dias")).toBeTruthy();
    const status = screen.getByRole("status", { name: "Editando agora" });
    expect(within(status).getByText("Editando agora:")).toBeTruthy();
    expect(within(status).getByText("Ana Souza")).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("023/US3-1 o líder não vê o aviso; a barra diz quem edita depois de uma passagem", () => {
    renderWithProviders(
      <>
        <GroupNotice group={group({ myRole: "LEADER", addedBy: null })} />
        <GroupBar activityId="bbbbbbbb-0000-4000-8000-000000000001" open={false} group={group({ myRole: "LEADER", addedBy: null, editor: BRUNO })} />
      </>,
    );
    expect(screen.queryByText(/Você está no grupo de/)).toBeNull();
    expect(within(screen.getByRole("status", { name: "Editando agora" })).getByText("Bruno Lima")).toBeTruthy();
  });

  it("023/FR-009 nomes com HTML aparecem como texto", () => {
    const xss = { id: "cccccccc-0000-4000-8000-000000000009", name: '<img src=x onerror="alert(1)">Eva' };
    const { container } = renderWithProviders(
      <>
        <GroupNotice group={group({ leader: xss, members: [xss, BRUNO], editor: xss, addedBy: xss })} />
        <GroupBar activityId="bbbbbbbb-0000-4000-8000-000000000001" open={false} group={group({ leader: xss, members: [xss, BRUNO], editor: xss, addedBy: xss })} />
      </>,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(`Você está no grupo de ${xss.name} neste trabalho.`)).toBeTruthy();
  });
});
