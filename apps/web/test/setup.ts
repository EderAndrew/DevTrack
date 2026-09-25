import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom lacks pointer capture and scrollIntoView, which Radix Select calls when it opens.
if (typeof Element !== "undefined") {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
}

// jsdom lacks ResizeObserver, which Radix Switch and Popper (Popover, DropdownMenu) use.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(() => {
  cleanup();
});
