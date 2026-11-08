import { colorsFor } from "@repo/design-tokens";
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { ThemeProvider, themeNameOf, useTheme } from "./theme-provider";

function Probe() {
  const { name, colors } = useTheme();
  return <Text accessibilityLabel="tema">{`${name} ${colors.background}`}</Text>;
}

describe("024/FR-023 o tema do app segue a Aparência da conta (022)", () => {
  it("024/FR-023 sem sessão o tema é escuro; LIGHT vindo de GET /me troca as cores para as do tema claro, e DARK volta", async () => {
    const { rerender } = await render(
      <ThemeProvider theme={null}>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByLabelText("tema")).toHaveTextContent(`dark ${colorsFor("dark").background}`);

    await rerender(
      <ThemeProvider theme="LIGHT">
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByLabelText("tema")).toHaveTextContent(`light ${colorsFor("light").background}`);

    await rerender(
      <ThemeProvider theme="DARK">
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByLabelText("tema")).toHaveTextContent(`dark ${colorsFor("dark").background}`);
  });

  it("um valor desconhecido fica no escuro", () => {
    expect(themeNameOf(undefined)).toBe("dark");
    expect(themeNameOf("LIGHT")).toBe("light");
  });
});
