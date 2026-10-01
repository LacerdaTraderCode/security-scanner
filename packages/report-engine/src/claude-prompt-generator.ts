import Anthropic from "@anthropic-ai/sdk";
import type { NormalizedFinding } from "@scanner/shared/types/finding";

/**
 * For each finding, generates a READY-TO-PASTE prompt for Claude / Claude Code
 * that fixes that specific point — with file context, line, code snippet, and
 * the exact nature of the vulnerability.
 *
 * Runs in batch from the worker (doesn't block the dashboard). Uses the
 * Sonnet model for cost/quality balance — swappable via env var.
 */

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an application security expert generating fix prompts
meant to be pasted directly into Claude Code by a developer. Your only output should be
the fix prompt itself — no preamble, no explanation of what you're doing.

The generated prompt must:
1. Describe the vulnerability specifically (not generically)
2. Point to the exact file and line
3. Include the vulnerable code snippet as context
4. Ask for the specific fix expected (not "fix this", but exactly what to change)
5. Ask to preserve existing functional behavior
6. Be direct and actionable — the developer will paste this and run it, not edit it first

Never include real secrets in the prompt (if the finding is a secret leak, reference the
type of secret, never the actual value).`;

export async function generateFixPrompt(finding: NormalizedFinding): Promise<string> {
  // Structural-only findings (deep-checks) and secret leaks use fixed templates —
  // no API call needed, saving tokens on standardized cases.
  if (finding.category === "SECRET_LEAK") {
    return `I found an exposed secret in the code at \`${finding.filePath}\` (line ${finding.lineStart}).

Please:
1. Remove the hardcoded secret from this file
2. Replace it with a read from an environment variable (e.g. \`process.env.VAR_NAME\`)
3. Add the corresponding variable to \`.env.example\` (without the real value)
4. Confirm that \`.env\` is in \`.gitignore\`

I don't need you to generate a new secret value — I'll revoke the current one and generate a new one separately.`;
  }

  if (finding.isStructuralOnly) {
    return `Structural security finding: ${finding.title}

Description: ${finding.description}

${finding.filePath ? `Related file: ${finding.filePath}` : ""}

Recommendation: ${finding.remediation}

Please implement the fix recommended above, preserving the system's existing functional behavior.`;
  }

  // For real SAST/SCA/DAST findings, generate via Claude to keep it context-specific.
  const userPrompt = `Security finding:
- Tool: ${finding.tool}
- Severity: ${finding.severity}
- Category: ${finding.category}
- Title: ${finding.title}
- Description: ${finding.description}
${finding.filePath ? `- File: ${finding.filePath}${finding.lineStart ? ` (lines ${finding.lineStart}-${finding.lineEnd ?? finding.lineStart})` : ""}` : ""}
${finding.codeSnippet ? `- Code snippet:\n\`\`\`\n${finding.codeSnippet}\n\`\`\`` : ""}
${finding.packageName ? `- Affected package: ${finding.packageName}@${finding.packageVersion}` : ""}
${finding.cveId ? `- CVE: ${finding.cveId}` : ""}
${finding.endpointUrl ? `- Endpoint: ${finding.httpMethod ?? "GET"} ${finding.endpointUrl}` : ""}
- Tool's recommendation: ${finding.remediation}

Generate the fix prompt to paste into Claude Code.`;

  const response = await client.messages.create({
    model: process.env.ANTHROPIC_PROMPT_GEN_MODEL ?? "claude-sonnet-4-6",
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock && textBlock.type === "text" ? textBlock.text : "Could not auto-generate the prompt — use the tool's default recommendation instead.";
}

/**
 * Generates prompts in batch with limited concurrency — avoids API rate
 * limits and keeps cost predictable on scans with many findings.
 */
export async function generateFixPromptsBatch(
  findings: NormalizedFinding[],
  concurrency = 5
): Promise<Map<NormalizedFinding, string>> {
  const results = new Map<NormalizedFinding, string>();
  const queue = [...findings];

  async function worker() {
    while (queue.length > 0) {
      const finding = queue.shift();
      if (!finding) continue;
      try {
        const prompt = await generateFixPrompt(finding);
        results.set(finding, prompt);
      } catch (err) {
        results.set(finding, `Error generating prompt: ${err instanceof Error ? err.message : String(err)}. Use the recommendation instead: ${finding.remediation}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}
