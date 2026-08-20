import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import i18n from '@/i18n';

// The app defaults to Lao. Tests assert against the English catalogue so the
// expectations stay readable — and any missing English key fails a test here.
void i18n.changeLanguage('en');

afterEach(() => {
  cleanup();
});

// Radix primitives measure elements with APIs jsdom does not implement.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// `Select` drives its listbox through pointer capture and scrolls the chosen item
// into view. Without these, opening one throws instead of rendering its options,
// which would leave every form built on `SelectField` untestable.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

// Selecting an image in `FileUpload` previews it from a blob URL, which jsdom has
// no notion of. The identity of the string does not matter to any assertion — only
// that picking a file does not throw.
URL.createObjectURL ??= () => 'blob:preview';
URL.revokeObjectURL ??= () => {};

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
