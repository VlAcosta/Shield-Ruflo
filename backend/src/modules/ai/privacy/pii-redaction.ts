export type PiiRedactionResult = {
  text: string;
  redactions: Record<'email' | 'phone' | 'paymentCard' | 'document', number>;
};

function replaceCount(value: string, pattern: RegExp, replacement: string) {
  let count = 0;
  return {
    value: value.replace(pattern, () => {
      count += 1;
      return replacement;
    }),
    count,
  };
}

export function redactPii(input: string): PiiRedactionResult {
  let text = String(input ?? '');
  const redactions = { email: 0, phone: 0, paymentCard: 0, document: 0 };

  const email = replaceCount(text, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]');
  text = email.value;
  redactions.email = email.count;

  const phone = replaceCount(text, /(?<!\d)(?:\+?\d[\s().-]?){10,15}(?!\d)/g, '[PHONE]');
  text = phone.value;
  redactions.phone = phone.count;

  const card = replaceCount(text, /\b(?:\d[ -]*?){13,19}\b/g, '[PAYMENT_CARD]');
  text = card.value;
  redactions.paymentCard = card.count;

  const document = replaceCount(text, /\b(?:паспорт|passport)\s*[:№#-]?\s*[A-ZА-Я0-9 -]{5,24}\b/gi, '[DOCUMENT]');
  text = document.value;
  redactions.document = document.count;

  return { text, redactions };
}
