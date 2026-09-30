# ChrisStop Servis – poznámky pre vývoj

- UI texty, komentáre a správy sú **po slovensky**. Kód (identifikátory) po anglicky, názvy nástrojov AI agenta a ich polí po slovensky bez diakritiky.
- Frontend: `src/` (React 19, TS, Tailwind 4). Stránky v `src/pages`, zdieľané komponenty v `src/components` (`ui.tsx` = základné prvky, `domain.tsx` = doménové prvky), dátová vrstva `src/lib/db.ts`, typy `src/lib/types.ts`, stavy a konštanty `src/lib/constants.ts`.
- Živé dáta poskytuje `src/features/data.tsx` (otvorené + nedávno uzavreté zákazky/objednávky, zákazníci, cenník, udalosti). Staršie záznamy sa hľadajú cez pole `keywords` (`array-contains`).
- `src/lib/keywords.ts` a `functions/src/lib/keywords.ts` musia ostať zhodné.
- Stavy zákaziek/objednávok sú definované na troch miestach: `src/lib/constants.ts`, `src/lib/types.ts`, `functions/src/lib/store.ts`.
- AI agent: `functions/src/agent/` – `tools.ts` (nástroje + zod schémy), `run.ts` (slučka so streamovaním, história len pripájaná), `prompt.ts` (stabilný systémový prompt; aktuálny čas ide do správy používateľa).
- Overenie: `npx tsc -b` (koreň), `npm run build --prefix functions`, `npm run build`. Lokálne testy proti emulátorom (`npx firebase emulators:start --project demo-chrisstop`, `VITE_USE_EMULATORS=true npm run dev`).
- Pravidlá databázy (`firestore.rules`) povoľujú prístup iba členom (`members/{uid}`); mazanie zákaziek, objednávok a zákazníkov iba majiteľovi.
