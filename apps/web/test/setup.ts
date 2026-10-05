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

// jsdom has Range but no layout: CodeMirror measures text through Range.getClientRects and
// getBoundingClientRect (014 L13). Empty geometry is enough; tests assert on the DOM and onChange.
if (typeof Range !== "undefined") {
  const emptyRect = () => new DOMRect(0, 0, 0, 0);
  const emptyList = () => Object.assign([] as DOMRect[], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect ??= emptyRect;
  Range.prototype.getClientRects ??= emptyList;
}
if (typeof document !== "undefined") {
  document.createRange ??= () => new Range();
}

afterEach(() => {
  cleanup();
});
