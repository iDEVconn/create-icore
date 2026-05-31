// Augments globalThis so TypeScript accepts custom properties set in
// global-setup.ts and read in global-teardown.ts (TS7017 fix).
declare global {
   
  var __TEARDOWN_MESSAGE__: string;
}
export {};
