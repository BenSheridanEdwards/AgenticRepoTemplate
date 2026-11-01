#!/usr/bin/env sh
exec node -e '
const { readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const deny = (message) => process.stdout.write(JSON.stringify({
  permission: "deny", user_message: message, agent_message: message,
}));

try {
  const { command } = JSON.parse(readFileSync(0, "utf8"));
  if (typeof command !== "string" || command.trim() === "") {
    throw new Error("Missing command");
  }
  const result = spawnSync("sh", [".agents/hooks/block-gate-bypass.sh"], {
    input: JSON.stringify({ tool_input: { command } }), encoding: "utf8",
  });
  if (result.status === 0) {
    process.stdout.write(JSON.stringify({ permission: "allow" }));
  } else {
    deny(result.stderr || "Blocked: the gate-bypass guard could not run.");
  }
} catch {
  deny("Blocked: the hook could not read the command.");
}
'
