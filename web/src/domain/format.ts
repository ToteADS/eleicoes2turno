const intFmt = new Intl.NumberFormat('pt-BR');

export const formatInt = (n: number): string => intFmt.format(Math.round(n));

export const formatPct = (p: number, digits = 2): string =>
  `${(p * 100).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
