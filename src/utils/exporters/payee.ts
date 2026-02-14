export function derivePayee(description: string): string {
  const original = description.trim();
  let payee = original;

  const primaryPrefixes: RegExp[] = [
    /^Withdrawal:\s*/i,
    /^Deposit:\s*/i,
    /^Credit card purchase:\s*/i,
    /^Credit card hold:\s*/i,
    /^Credit card refund:\s*/i,
  ];

  primaryPrefixes.forEach((prefix) => {
    payee = payee.replace(prefix, '');
  });

  const secondaryPrefixes: RegExp[] = [
    /^AFT\s+/i,
    /^e-Transfer\s+/i,
    /^EFT\s+/i,
    /^Bill pay\s+/i,
  ];

  secondaryPrefixes.forEach((prefix) => {
    payee = payee.replace(prefix, '');
  });

  payee = payee.trim();
  return payee.length > 0 ? payee : original;
}
