/** Verejná stránka so stavom opravy – pre zákazníka (bez prihlásenia). */
export const statusUrl = (repairId: string) => `${window.location.origin}/stav/${repairId}`;

/** Odkaz z QR kódu na protokole a štítku: majiteľovi otvorí celú zákazku, zákazníkovi stav opravy. */
export const repairQrUrl = (repairId: string) => `${window.location.origin}/zakazky/${repairId}`;

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
