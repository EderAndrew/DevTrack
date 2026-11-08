import { readFileSync, writeFileSync } from "node:fs";
import { generatedSource } from "./parse-tokens.ts";

// 024 (research Y11): tokens.css → src/generated.ts. The generated file is committed.
export const TOKENS_CSS = new URL("../../../apps/web/design-system/tokens.css", import.meta.url);
export const GENERATED = new URL("../src/generated.ts", import.meta.url);

writeFileSync(GENERATED, generatedSource(readFileSync(TOKENS_CSS, "utf8")));
