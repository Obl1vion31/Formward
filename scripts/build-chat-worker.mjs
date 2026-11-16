import {build} from "esbuild";
import {resolve} from "node:path";
await build({entryPoints:[resolve("scripts/self-hosting/chat-worker.ts")],outfile:resolve(".next/chat-worker.mjs"),bundle:true,platform:"node",format:"esm",target:"node24",packages:"bundle",external:["next/*"],banner:{js:'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);'},logLevel:"silent"});
