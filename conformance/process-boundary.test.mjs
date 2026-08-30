import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Process is Continuum plus pinned execution Settings, not a phantom wrapper", async () => {
  const process = await readFile(new URL("../process/README.md", import.meta.url), "utf8");
  const boundary = await readFile(new URL("../contracts/registry-process-boundary.md", import.meta.url), "utf8");
  const engineBoundary = JSON.parse(await readFile(new URL("../contracts/runtime-engine-boundary.v1.json", import.meta.url), "utf8"));

  assert.match(process, /Continuum institutional kernel plus its execution Settings/);
  assert.match(process, /continuum-adk/);
  assert.match(process, /continuum-ai-sdk/);
  assert.match(boundary, /Registry owns/);
  assert.match(boundary, /Process owns/);
  assert.match(boundary, /workspace role is never a PowerFarm authority grant/);
  assert.equal(engineBoundary.institutional_kernel, "Continuum");
  assert.equal(engineBoundary.engines["google-adk"].setting, "process/continuum-adk");
  assert.equal(engineBoundary.engines["vercel-ai-sdk"].setting, "process/continuum-ai-sdk");
});
