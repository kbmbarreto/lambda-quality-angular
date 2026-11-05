import { Pipe, PipeTransform } from '@angular/core';

export const businessTimezone = 'America/Sao_Paulo';
const formatters = new Map<string, Intl.DateTimeFormat>();
/** Calendar dates remain calendar dates; timestamps are instants in São Paulo. */
export function businessDate(
  value: string | number | Date | null | undefined,
  format = 'dd/MM/yyyy HH:mm:ss',
): string | null {
  if (value == null || value === '') return null;
  const calendar = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(calendar ? `${value}T12:00:00Z` : value);
  if (!Number.isFinite(date.getTime())) return null;
  const timezone = calendar ? 'UTC' : businessTimezone;
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timezone, formatter);
  }
  const parts = formatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  const tokens: Record<string, string> = {
    yyyy: part('year'),
    MM: part('month'),
    dd: part('day'),
    HH: part('hour'),
    mm: part('minute'),
    ss: part('second'),
  };
  return format.replace(/yyyy|MM|dd|HH|mm|ss/g, (token) => tokens[token]);
}
@Pipe({ name: 'date' })
export class SaoPauloDatePipe implements PipeTransform {
  transform(
    value: string | number | Date | null | undefined,
    format = 'dd/MM/yyyy',
    _timezone?: string,
  ) {
    return businessDate(value, format);
  }
}
