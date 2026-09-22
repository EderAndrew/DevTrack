import type { DestinationStream } from "pino";

/** In-memory pino destination: tests scan everything the API logged (SC-005). */
export class LogCapture implements DestinationStream {
  private readonly chunks: string[] = [];

  write(chunk: string): void {
    this.chunks.push(chunk);
  }

  text(): string {
    return this.chunks.join("");
  }

  lines(): Record<string, unknown>[] {
    return this.text()
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  }

  clear(): void {
    this.chunks.length = 0;
  }
}

export function captureLogs(): LogCapture {
  return new LogCapture();
}
