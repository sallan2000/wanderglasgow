import { createEmailHandler } from './handler.ts';

// The implementation is standard Web APIs; only this entry point uses Deno.
const runtime = (globalThis as unknown as {
  Deno: { env: { get: (name: string) => string | undefined }; serve: (handler: (request: Request) => Promise<Response>) => unknown };
}).Deno;
runtime.serve(createEmailHandler({ env: name => runtime.env.get(name), fetch }));