#!/usr/bin/env node
/**
 * Hook: block the shell commands an autonomous agent must never run in this
 * repo, regardless of what the prompt says. Hooks are enforced by the runtime,
 * not the model, so they hold even when the prompt is wrong.
 *
 * Input arrives on stdin as JSON ({ command, cwd, ... }); output is JSON with
 * { continue, permission: "allow" | "deny" | "ask", user_message?, agent_message? }.
 * See https://cursor.com/docs/hooks for the full schema. Cloud agents run this
 * from .cursor/hooks.json; hooks do not run during read-only exploratory
 * turns, only once the agent has a writable environment.
 *
 * The first block is the generic cloud-agents kit guard. The second block is
 * Scholaracle-specific: every entry maps to a line in AGENTS.md "Never" and
 * to something that has cost real money or shipped to real users when run by
 * accident (EAS builds, store submissions, OTA updates, Railway deploys,
 * break-glass workflow dispatch).
 */
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
const command = String(input.command ?? "");

const denied = [
  // --- generic: what no agent may do to git or a deploy target ---
  { re: /\bgit\s+push\b.*--force\b/, why: "force-push is never allowed for agents" },
  { re: /\bgit\s+push\b.*\b(main|master|develop)\b/, why: "agents push feature branches, never the integration branch (main/master/develop)" },
  { re: /\bgit\s+reset\s+--hard\b/, why: "destructive reset" },
  { re: /\brm\s+-rf\s+(\/|~|\.)\s*$/, why: "destructive delete of a root" },
  { re: /\bnpm\s+publish\b|\bpnpm\s+publish\b|\byarn\s+publish\b/, why: "publishing requires a human" },
  { re: /\b(vercel|railway|fly|kubectl|terraform|aws|gcloud)\s+(deploy|apply|up|rollout)\b/, why: "deploys require a human" },
  { re: /--no-verify\b/, why: "hooks must not be skipped (see .cursor/rules/commit-clean.mdc)" },

  // --- scholaracle: mobile shipping costs build credits and reaches real devices ---
  { re: /\beas(-cli)?\s+(build|submit|update|workflow)\b/, why: "EAS build/submit/update/workflow is human-only (build credits, TestFlight, Play, OTA to real users)" },
  { re: /\bpnpm\b[^|;&]*\s(ship(:[\w:-]+)?|build:ios|build:android(:[\w-]+)?|submit(:[\w-]+)?|update:preview|update:production)\b/, why: "ship/build/submit/update scripts run EAS against real stores and channels" },

  // --- scholaracle: backend deploys are owned by Railway's GitHub integration ---
  { re: /\brailway\s+(?!status\b|logs\b|whoami\b|variables\b(?!\s+--set))/, why: "railway is read-only for agents; deploys happen via main push after CI" },
  { re: /\bgh\s+workflow\s+run\b/, why: "workflow dispatch is the break-glass path (skip_e2e); humans only" },
  { re: /\bdocker\s+push\b/, why: "images are built and pushed by CI/Railway, never from an agent" },

  // --- scholaracle: never regenerate the lockfile or bypass the frozen install ---
  { re: /\bpnpm\s+install\b(?!.*--frozen-lockfile)/, why: "install with --frozen-lockfile; lockfile changes are a human-reviewed dependency change" },
  { re: /\bpnpm\b[^|;&]*\s(add|remove|update|up)\b/, why: "dependency changes require a human; state the need in the PR instead" },
];

for (const { re, why } of denied) {
  if (re.test(command)) {
    process.stdout.write(
      JSON.stringify({
        continue: true,
        permission: "deny",
        user_message: `Blocked by .cursor/hooks: ${why}`,
        agent_message: `That command is blocked in this repository (${why}). Choose a non-destructive alternative or report in your final message that a human must do it.`,
      }),
    );
    process.exit(0);
  }
}

process.stdout.write(JSON.stringify({ continue: true, permission: "allow" }));
