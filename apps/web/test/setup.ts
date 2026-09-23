import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom lacks pointer capture and scrollIntoView, which Radix Select calls when it opens.
if (typeof Element !== "undefined") {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
}

afterEach(() => {
  cleanup();
});
