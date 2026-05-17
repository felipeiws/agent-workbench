import type { AuditRisk } from "../../types/src/index";

export interface SuspicionMatch {
  risk: AuditRisk;
  reason: string;
}

interface RiskPattern {
  pattern: RegExp;
  reason: string;
}

const HIGH_RISK: RiskPattern[] = [
  { pattern: /rm\s+(-[^\s]*r[^\s]*f|-[^\s]*f[^\s]*r)\s+\//, reason: "Forced recursive deletion of root path" },
  { pattern: /rm\s+-[rRfF]{2,}\s+/, reason: "Forced recursive deletion" },
  { pattern: /mkfs/, reason: "Filesystem formatting" },
  { pattern: /\bdd\b.*\bif=/, reason: "Low-level disk write" },
  { pattern: />\s*\/etc\//, reason: "Writing to system directory" },
  { pattern: /(curl|wget)\s+.*\|\s*(ba|z)?sh/, reason: "Remote script execution via pipe" },
  { pattern: /base64\s+-d.*\|\s*(ba|z)?sh/, reason: "Encoded remote script execution" },
  { pattern: /eval\s+["']?\$\(/, reason: "Dynamic command evaluation" },
  { pattern: /cat\s+(~\/\.ssh|\/etc\/(passwd|shadow|sudoers))/, reason: "Sensitive credential access" },
];

const MEDIUM_RISK: RiskPattern[] = [
  { pattern: /\bsudo\s+/, reason: "Elevated privilege execution" },
  { pattern: /chmod\s+(-R\s+)?[0-7]*7[0-7]{2}/, reason: "Permissive file permissions" },
  { pattern: /git\s+push\s+.*--force/, reason: "Force git push" },
  { pattern: /\bnpm\s+publish\b/, reason: "Package publication" },
  { pattern: /\bkill\s+-9\b/, reason: "Force process termination" },
  { pattern: /\bkillall\b/, reason: "Bulk process termination" },
  { pattern: /(env|cat\s+\.env).*\|\s*curl/, reason: "Potential env var exfiltration" },
  { pattern: /curl.*\$\{?[A-Z_]*(?:TOKEN|KEY|SECRET|PASSWORD)[A-Z_]*\}?/, reason: "Credential exfiltration attempt" },
];

const LOW_RISK: RiskPattern[] = [
  { pattern: /\brm\s+.*-[rRfF]/, reason: "Recursive or forced file deletion" },
  { pattern: /\bgit\s+push\b/, reason: "Git push" },
  { pattern: /\bnpm\s+install\s+(-g|--global)\b/, reason: "Global package installation" },
  { pattern: /\bpip\s+install\b/, reason: "Python package installation" },
  { pattern: /\bnpx\s+/, reason: "Remote script execution via npx" },
];

export function detectSuspiciousCommand(input: string): SuspicionMatch | null {
  const normalized = input.replace(/\\\n/g, " ").trim();

  if (!normalized) {
    return null;
  }

  for (const { pattern, reason } of HIGH_RISK) {
    if (pattern.test(normalized)) {
      return { risk: "high", reason };
    }
  }

  for (const { pattern, reason } of MEDIUM_RISK) {
    if (pattern.test(normalized)) {
      return { risk: "medium", reason };
    }
  }

  for (const { pattern, reason } of LOW_RISK) {
    if (pattern.test(normalized)) {
      return { risk: "low", reason };
    }
  }

  return null;
}
