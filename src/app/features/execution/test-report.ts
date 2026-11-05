import { RunCase, TestResult, canPass } from './execution.models';

export const reportLimit = 2 * 1024 * 1024;
export interface ReportResult {
  name: string;
  reference: string;
  result: Exclude<TestResult, 'NOT_TESTED' | 'BLOCKED'>;
  comment: string;
}
export function parseJUnit(text: string): ReportResult[] {
  if (new TextEncoder().encode(text).length > reportLimit)
    throw new Error('O relatório deve ter até 2 MiB.');
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw new Error('O relatório não pode conter DTD ou entidades XML.');
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  if (
    xml.querySelector('parsererror') ||
    !['testsuite', 'testsuites'].includes(xml.documentElement.localName)
  )
    throw new Error('Selecione um relatório JUnit XML válido (testsuite ou testsuites).');
  const cases = Array.from(xml.querySelectorAll('testcase'));
  if (!cases.length || cases.length > 500)
    throw new Error('O relatório deve conter de 1 a 500 resultados.');
  return cases.map((item) => {
    const children = Array.from(item.children);
    const failures = children.filter((child) => ['failure', 'error'].includes(child.localName));
    const skipped = children.some((child) => child.localName === 'skipped');
    const property = Array.from(item.querySelectorAll('property')).find((p) =>
      ['lambdaquality.caseId', 'lambdaquality.humanId'].includes(p.getAttribute('name') ?? ''),
    );
    return {
      name:
        [item.getAttribute('classname'), item.getAttribute('name')].filter(Boolean).join(' · ') ||
        'Teste sem nome',
      reference: property?.getAttribute('value')?.trim() ?? item.getAttribute('name')?.trim() ?? '',
      result: failures.length ? 'FAILED' : skipped ? 'SKIPPED' : 'PASSED',
      comment: failures
        .map((f) => [f.getAttribute('message'), f.textContent?.trim()].filter(Boolean).join('\n'))
        .join('\n')
        .slice(0, 8000),
    };
  });
}
export function reportMatch(row: ReportResult, cases: RunCase[]): string {
  const exact = cases.filter(
    (c) => c.testCaseId === row.reference || c.humanIdSnapshot === row.reference,
  );
  if (exact.length === 1) return exact[0].id;
  const contained = cases.filter((c) => {
    const key = c.humanIdSnapshot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\w-])${key}($|[^\\w-])`, 'i').test(row.reference);
  });
  return contained.length === 1 ? contained[0].id : '';
}
export function reportIssue(row: ReportResult, target: RunCase | undefined): string {
  if (!target) return 'Escolha um caso desta execução.';
  if (row.result === 'PASSED' && !canPass(target))
    return 'Há passos pendentes. Conclua ou ignore os passos antes de importar “Passou”.';
  return '';
}
