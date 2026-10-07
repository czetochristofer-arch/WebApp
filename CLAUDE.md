# ChrisStop Servis – poznámky pre vývoj

- UI texty, komentáre a správy sú **po slovensky**. Kód (identifikátory) po anglicky, názvy nástrojov AI agenta a ich polí po slovensky bez diakritiky.
- Frontend: `src/` (React 19, TS, Tailwind 4). Stránky v `src/pages`, zdieľané komponenty v `src/components` (`ui.tsx` = základné prvky, `domain.tsx` = doménové prvky), dátová vrstva `src/lib/db.ts`, typy `src/lib/types.ts`, stavy a konštanty `src/lib/constants.ts`.
- Živé dáta poskytuje `src/features/data.tsx` (otvorené + nedávno uzavreté zákazky/objednávky, zákazníci, cenník, udalosti). Staršie záznamy sa hľadajú cez pole `keywords` (`array-contains`).
- `src/lib/keywords.ts` a `functions/src/lib/keywords.ts` musia ostať zhodné.
- Stavy zákaziek/objednávok sú definované na viacerých miestach: `src/lib/constants.ts` (aj texty pre zákazníka `REPAIR_STATUS_PUBLIC`), `src/lib/types.ts`, `functions/src/lib/store.ts` a kroky priebehu `STEP_OF` v `src/pages/PublicStatus.tsx`.
- Záruka je v mesiacoch (`warrantyMonths`, predvolene 12). Staršie zákazky majú `warrantyDays`; hodnota 90 (pôvodná predvolená) sa berie ako predvolená záruka. Logika `warrantyOf` je v `src/lib/constants.ts` a `functions/src/lib/store.ts` – musí ostať zhodná.
- Reklamácie sú zákazky s `kind: 'reklamacia'` a poľom `claim` (pôvodná zákazka/objednávka, záruka, výsledok); číslujú sa samostatne (počítadlo `counters/claims`, prefix R). Bežné zákazky pole `kind` nemajú. Zoznam zákaziek reklamácie skrýva, majú vlastnú stránku `/reklamacie`.
- Stav dielov sa mení cez `setPartStatus` (transakcia nad aktuálnou zákazkou) – prehľad v `src/features/PartsBoard.tsx`.
- Verejná stránka stavu opravy (`/stav/:id`, a pre neprihláseného aj `/zakazky/:id` z QR kódu) číta údaje cez funkciu `repairStatus` – vracia len údaje vhodné pre zákazníka.
- AI agent: `functions/src/agent/` – `tools.ts` (nástroje + zod schémy), `run.ts` (slučka so streamovaním, história len pripájaná; model a systémový prompt sa fixujú pri vzniku konverzácie; fotky sa ukladajú ako odkaz do úložiska `agent/{uid}/…`), `prompt.ts` (stabilný systémový prompt; aktuálny čas a hlasový režim idú do správy používateľa). Model: Sonnet 5.5, v Nastaveniach voliteľne Haiku 4.5 (iné parametre požiadavky – `modelParams`).
- Hlas v aplikácii: `src/features/assistant/speech.ts` (diktovanie), `tts.ts` (čítanie odpovedí po vetách, nastavenia hlasu v zariadení).
- Overenie: `npx tsc -b` (koreň), `npm run build --prefix functions`, `npm run build`. Lokálne testy proti emulátorom (`npx firebase emulators:start --project demo-chrisstop`, `VITE_USE_EMULATORS=true npm run dev`).
- Pravidlá databázy (`firestore.rules`) povoľujú prístup iba členom (`members/{uid}`); mazanie zákaziek, objednávok a zákazníkov iba majiteľovi.
