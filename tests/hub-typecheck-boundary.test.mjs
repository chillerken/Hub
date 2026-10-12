import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {resolve} from "node:path";

test("Vite typecheck includes application sources and excludes separate runtimes",()=>{
 const file=ts.readConfigFile("tsconfig.json",ts.sys.readFile);
 assert.equal(file.error,undefined);
 const config=ts.parseJsonConfigFileContent(file.config,ts.sys,process.cwd());
 assert.equal(config.errors.length,0);
 const files=config.fileNames.map(x=>resolve(x));
 assert(files.includes(resolve("src/App.tsx")));
 assert(files.includes(resolve("src/main.tsx")));
 assert(files.includes(resolve("vite.config.ts")));
 assert(!files.some(x=>x.includes("/supabase/functions/")),"Deno functions need their own runtime checker");
 assert(!files.some(x=>x.endsWith("playwright.config.ts")),"Browser acceptance tests are checked in their own workflow");
});
