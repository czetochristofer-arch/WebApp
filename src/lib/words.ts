const UNITS = ['', 'jeden', 'dva', 'tri', 'štyri', 'päť', 'šesť', 'sedem', 'osem', 'deväť'];
const TEENS = ['desať', 'jedenásť', 'dvanásť', 'trinásť', 'štrnásť', 'pätnásť', 'šestnásť', 'sedemnásť', 'osemnásť', 'devätnásť'];
const TENS = ['', '', 'dvadsať', 'tridsať', 'štyridsať', 'päťdesiat', 'šesťdesiat', 'sedemdesiat', 'osemdesiat', 'deväťdesiat'];

/** 0–999 slovom (bez medzier, ako sa píše na dokladoch). */
function below1000(n: number) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  let out = h === 0 ? '' : h === 1 ? 'sto' : h === 2 ? 'dvesto' : `${UNITS[h]}sto`;
  if (rest >= 10 && rest < 20) out += TEENS[rest - 10];
  else out += TENS[Math.floor(rest / 10)] + UNITS[rest % 10];
  return out;
}

/** Celé číslo slovom po slovensky, napr. 1250 → „tisícdvestopäťdesiat“. */
export function numberInWords(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return 'nula';
  if (n >= 1_000_000) {
    const m = Math.floor(n / 1_000_000);
    const rest = n % 1_000_000;
    const head = m === 1 ? 'milión' : m < 5 ? `${m === 2 ? 'dva' : below1000(m)}milióny` : `${numberInWords(m)}miliónov`;
    return head + (rest ? numberInWords(rest) : '');
  }
  const t = Math.floor(n / 1000);
  const rest = n % 1000;
  const thousands = t === 0 ? '' : t === 1 ? 'tisíc' : t === 2 ? 'dvetisíc' : `${below1000(t)}tisíc`;
  return thousands + below1000(rest);
}

/** Suma slovom pre doklady, napr. 125.5 → „stodvadsaťpäť eur 50 centov“. */
export function amountInWords(amount: number) {
  const rounded = Math.round(Math.abs(amount) * 100);
  const euros = Math.floor(rounded / 100);
  const cents = rounded % 100;
  const eurWord = euros === 1 ? 'jedno euro' : euros === 2 ? 'dve eurá' : euros === 3 || euros === 4 ? `${UNITS[euros]} eurá` : `${numberInWords(euros)} eur`;
  return cents ? `${eurWord} ${String(cents).padStart(2, '0')} centov` : eurWord;
}
