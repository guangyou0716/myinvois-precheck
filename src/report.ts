import type { Finding, ValidationResult } from './types.js';

function countBySeverity(findings: Finding[]): { errorCount: number; warningCount: number } {
  let errorCount = 0;
  let warningCount = 0;
  for (const finding of findings) {
    if (finding.severity === 'error') errorCount += 1;
    else warningCount += 1;
  }
  return { errorCount, warningCount };
}

function plural(n: number, singular: string): string {
  return n === 1 ? singular : `${singular}s`;
}

function formatFinding(finding: Finding): string {
  const severity = finding.severity === 'error' ? 'ERROR' : 'WARN';
  const code = finding.lhdnCode !== undefined ? `  [${finding.lhdnCode}]` : '';
  return `${severity}  ${finding.rule}${code}  ${finding.path}  ${finding.message}\n  see: ${finding.docUrl}`;
}

export function formatText(result: ValidationResult, fileName: string): string {
  const { errorCount, warningCount } = countBySeverity(result.findings);
  const version = result.version ?? '-';
  const status = result.ok ? 'PASS' : 'FAIL';
  const lines = [`${fileName}  ${version}  ${status}`];
  for (const finding of result.findings) {
    lines.push(formatFinding(finding));
  }
  lines.push(
    `${errorCount} ${plural(errorCount, 'error')}, ${warningCount} ${plural(warningCount, 'warning')}`,
  );
  return `${lines.join('\n')}\n`;
}

export function formatJson(result: ValidationResult, fileName: string): string {
  const { errorCount, warningCount } = countBySeverity(result.findings);
  return `${JSON.stringify(
    {
      file: fileName,
      ok: result.ok,
      version: result.version,
      errorCount,
      warningCount,
      findings: result.findings,
    },
    null,
    2,
  )}\n`;
}
