import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "./site-header";

describe("SiteHeader", () => {
  it("mostra o link para o início e a navegação", () => {
    render(<SiteHeader><nav aria-label="Conta" /></SiteHeader>);
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByRole("link", { name: "DevTrack" }).getAttribute("href")).toBe("/");
    expect(screen.getByText("Beta")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Conta" })).toBeTruthy();
  });
});
