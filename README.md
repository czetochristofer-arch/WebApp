# ChrisStop Servis

Webová aplikácia na riadenie servisu mobilov a elektroniky: zákazky, malé objednávky tovaru, kalendár s úlohami, zákazníci, cenník, štatistiky a AI asistent (Claude), ktorý s tým všetkým vie pracovať. Beží online na Firebase, dá sa nainštalovať do mobilu a funguje aj pri výpadku signálu.

## Čo aplikácia vie

| Časť | Funkcie |
|---|---|
| **Prehľad** | „Treba vybaviť“ ako farebné dlaždice (po termíne, hotové – zavolať, schválenie ceny, diely, objednávky, oznámené). Rozpracované zákazky ako karty s filtrom podľa stavu, dnešný program, úlohy, tržby mesiaca. |
| **Zákazky** | Prijatie zariadenia (zákazník, IMEI, kód, príslušenstvo, stav, porucha, fotky) alebo „oznámená“ oprava, keď zákazník zariadenie prinesie neskôr. Priebeh opravy v stavoch, položky práce a dielov s nákupnou cenou, záloha, termín, priorita, história zmien, vydanie s platbou, záruka 12 mesiacov. |
| **Tlač** | Preberací protokol s podmienkami servisu, štítok na zariadenie a výdajka so záručným listom. QR kód otvorí majiteľovi celú zákazku, zákazníkovi (bez prihlásenia) stránku so stavom opravy. |
| **Stav opravy pre zákazníka** | Verejná stránka `/stav/…`: stav, priebeh, termín, cena, záruka a kontakt na servis – bez telefónu, IMEI či interných poznámok. Odkaz sa dá poslať SMS-kou (premenná `{odkaz}`). |
| **Objednávky** | Puzdrá, sklá, nabíjačky…: treba objednať → objednané → doručené → vydané. Dodávateľ, záloha, očakávané doručenie. |
| **Kontakt** | Tlačidlá Zavolať / SMS / WhatsApp s predvyplnenou správou („zariadenie je hotové“, „objednávka dorazila“, schválenie ceny). |
| **Kalendár** | Deň (s pásikom týždňa na mobile), týždeň, mesiac, zoznam. Presun a zmena dĺžky udalosti ťahaním myšou, filter typov, mini kalendár, úlohy s odškrtávaním, termíny zákaziek. |
| **Zákazníci** | Adresár s históriou zákaziek a objednávok a celkovou útratou. Zákazník sa pri zákazke nájde podľa telefónu alebo vytvorí automaticky. |
| **Štatistiky** | Tržby, zisk, marža, počet a priemer zákaziek, doba opravy, graf za 12 mesiacov, najčastejšie opravy, značky, spôsoby platby. |
| **Cenník** | Ceny opráv a tovaru s nákupnými cenami. Vkladajú sa do zákaziek jedným klikom a pozná ich aj AI asistent. |
| **AI asistent** | Claude s 18 nástrojmi nad dátami aplikácie + vyhľadávaním na webe. Odpovedá na otázky („čo mám dnes robiť“, „aký bol zisk v septembri“), vytvára a upravuje zákazky, objednávky, zákazníkov, udalosti a úlohy, pripraví SMS/WhatsApp pre zákazníka, prečíta fotku (štítok, papierový zápis). Hlasom: na povel odpovedá nahlas, hlasový rozhovor bez rúk. Model Sonnet 5.5 alebo úsporný Haiku 4.5 (Nastavenia). Mazať nemôže. |
| **Tím** | Prihlásenie cez Google alebo e-mail. Prístup má iba majiteľ a pozvaní členovia; mazať a meniť nastavenia firmy môže len majiteľ. |
| **Ďalšie** | Globálne vyhľadávanie (Ctrl+K), svetlý/tmavý režim, záloha všetkých dát do súboru, nastaviteľné číslovanie nadväzujúce na papierovú evidenciu. |

## Prvé spustenie (jednorazovo)

1. **Firebase konzola** (<https://console.firebase.google.com>, projekt `chrisstop-app`):
   - *Upgrade* na plán **Blaze** (platba podľa využitia – potrebné pre serverové funkcie a úložisko fotiek). Odporúčame nastaviť rozpočtové upozornenie, napr. 10 €.
   - **Authentication → Sign-in method**: zapnúť **Google** a **Email/Password**.
   - **Storage → Get started** (vytvorí úložisko fotiek).
   - **Firestore Database** už existuje. Staré kolekcie `smallOrders` a staré dokumenty v `repairs` z predchádzajúcej verzie aplikácia ignoruje; môžete ich zmazať.
2. **Anthropic konzola** (<https://console.anthropic.com>): vytvoriť API kľúč a dobiť kredit.
3. **Google Cloud Shell** (<https://shell.cloud.google.com>, prihlásený rovnakým Google účtom):
   ```bash
   git clone https://github.com/czetochristofer-arch/WebApp.git && cd WebApp
   bash scripts/cloud-setup.sh chrisstop-app
   ```
   Skript sa opýta na e-mail majiteľa a Anthropic kľúč (uloží ich do Secret Manageru, nie do kódu) a vypíše kľúč pre GitHub.
4. **GitHub** → repozitár → *Settings → Secrets and variables → Actions* → *New repository secret* `FIREBASE_SERVICE_ACCOUNT` = text vypísaný skriptom.
5. Každý push do vetvy `main` odteraz aplikáciu automaticky nasadí (*Actions → Nasadenie na Firebase*; prvé spustenie aj ručne cez *Run workflow*).
6. Otvorte <https://chrisstop-app.web.app>, prihláste sa e-mailom majiteľa. V *Nastaveniach* doplňte údaje firmy, číslovanie a pozvite členov tímu.

## Vývoj

```bash
npm install && npm install --prefix functions
npm run build --prefix functions
npx firebase emulators:start --project demo-chrisstop     # lokálna databáza, prihlásenie, funkcie, úložisko
VITE_USE_EMULATORS=true npm run dev                        # aplikácia na http://localhost:5173
```

Pre emulátory vytvorte `functions/.secret.local`:

```
OWNER_EMAILS=vas@email.sk
ANTHROPIC_API_KEY=sk-ant-...
```

## Architektúra

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS 4, PWA (vite-plugin-pwa), Firestore s offline cache. Konfigurácia Firebase sa načítava z `/__/firebase/init.json`, ktoré poskytuje Firebase Hosting.
- **Dáta:** Firestore kolekcie `repairs`, `orders`, `customers`, `events`, `priceList`, `settings`, `counters`, `members`, `invites`, `agentThreads`. Fotky vo Firebase Storage. Pravidlá: `firestore.rules`, `storage.rules`.
- **Server:** Cloud Functions (Node 22, europe-west1):
  - `joinWorkspace` – po prihlásení overí majiteľa (tajomstvo `OWNER_EMAILS`) alebo pozvánku a vytvorí členstvo,
  - `agentChat` – AI asistent: Claude (`claude-sonnet-5-5`, adaptívne premýšľanie, automatický záložný model; voliteľne `claude-haiku-4-5`), nástroje v `functions/src/agent/tools.ts`, odpoveď sa streamuje do aplikácie a konverzácie sa ukladajú,
  - `repairStatus` – verejný stav opravy pre zákazníka (bez prihlásenia).
- **Nasadenie:** GitHub Actions (`.github/workflows/deploy.yml`) → `firebase deploy`.

## Náklady (orientačne)

- **Firebase (Blaze):** pri jednej prevádzke sa spotreba väčšinou zmestí do bezplatných limitov; počítajte rádovo s centami až pár eurami mesačne.
- **AI asistent (Anthropic API):** platí sa podľa počtu slov v otázkach a odpovediach, zvyčajne niekoľko centov za otázku. Presná spotreba je v Anthropic konzole, kde sa dá nastaviť aj mesačný limit.
