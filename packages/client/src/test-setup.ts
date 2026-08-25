// Global test setup for jsdom environment
// scrollIntoView is not implemented in jsdom
if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = function () {};
}
