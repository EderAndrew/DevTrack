import { describe, expect, it } from "vitest";
import { deriveDeliveryState, type DeliveryStateRow } from "./delivery-state";

const row = (status: DeliveryStateRow["status"], undeliveredReason: DeliveryStateRow["undeliveredReason"] = null): DeliveryStateRow => ({
  status,
  undeliveredReason,
});

describe("017 data-model: situação derivada do envio de um convite", () => {
  it.each([
    [[row("PENDING")], "SENDING", null],
    [[row("SENT")], "SENT", null],
    [[row("DELIVERED")], "SENT", null],
    [[row("FAILED")], "FAILED", null],
    [[row("UNDELIVERED", "BOUNCED")], "UNDELIVERED", "BOUNCED"],
    [[row("UNDELIVERED", "COMPLAINED")], "UNDELIVERED", "COMPLAINED"],
    [[row("DISCARDED"), row("SENT")], "SENT", null],
    [[row("SUPERSEDED"), row("UNDELIVERED", "REJECTED")], "UNDELIVERED", "REJECTED"],
    [[row("PENDING"), row("UNDELIVERED", "BOUNCED")], "SENDING", null],
    [[row("SUPERSEDED")], "FAILED", null],
    [[], "SENDING", null],
  ])("017/FR-015 %j → %s (%s)", (rows, delivery, deliveryIssue) => {
    expect(deriveDeliveryState(rows)).toEqual({ delivery, deliveryIssue });
  });
});
