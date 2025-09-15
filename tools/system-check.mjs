#!/usr/bin/env node
import fs from "fs";
import path from "path";

const ok = x => console.log("✔", x);
const bad = x => { console.error("✖", x); process.exitCode = 1; };
const must = p => fs.existsSync(p) ? ok(p) : bad(`MISSING ${p}`);

must(".claude/hooks/pre-task-verification.sh");
must(".claude/hooks/post-task-verification-enhanced.sh");
must("config/verification.profiles.json");
must("config/adapter-plan.json");

["adapters", "verifier", "tools", "schemas", "monitoring"].forEach(must);

for (const d of fs.readdirSync("adapters")) {
  const m = `adapters/${d}/manifest.json`;
  if (fs.existsSync(m)) ok(m);
  else bad(`MISSING ${m}`);
}

console.log("Done. If any ✖ printed above, fix before running e2e.");