# BlueBar — arkitektura

Implementimi aktual: React/Vite, Fastify në Vercel dhe Neon PostgreSQL. Hyrja me PIN, sesionet HttpOnly, autorizimi, IP restriction dhe multi-tenancy janë implementuar. Ndarja aktuale përdor një skemë për biznes (`bluebar_<uuid>`), me katalog qendror `bluebar_catalog.venues`; shih [README](../README.md#multi-tenant). Skema `bluebar` ruan instalimin ekzistues.

Pjesët më poshtë për modelin me `venue_id`, reçetat, fiskalizimin, pagination dhe print queue janë propozime për faza të ardhshme, jo përshkrim i funksionalitetit të publikuar.

## Vendimi
React + Vite + CSS i thjeshtë në frontend; Node.js/TypeScript + Fastify në një API modulare; Neon PostgreSQL për të dhënat. Një domain për UI dhe `/api`, me TLS dhe reverse proxy të kontrolluar. Pa microservices, Redux, framework UI, animacione ose ORM të rëndë në fillim. `pg` dhe migrime SQL të versionuara mjaftojnë. TypeScript rekomandohet për implementimin e prodhimit; eksperimenti aktual është JavaScript.

Frontend → API → Neon. Printeri lidhet me stacionin lokal ose një shërbim printimi të kufizuar në rrjetin e lokalit. Kredencialet Neon qëndrojnë vetëm në server; kurrë në variabla VITE_ ose shfletues.

Arsye: transaksionet e porosive, inventarit dhe pagesave kanë nevojë për një autoritet të vetëm. Një proces Node i qëndrueshëm thjeshton sesionet, pool-in, SSE dhe print queue. Serverless mbetet alternativë për ngarkesë sporadike, por kërkon vlerësim të lidhjeve, zgjimit dhe proceseve në sfond. Neon ofron pooling në transaction mode; përdor pooled URL për aplikacionin dhe lidhje direkte kur një migrim kërkon semantikë sesioni. [Neon pooling](https://neon.com/docs/connect/connection-pooling).

## Modulet dhe modeli i të dhënave

| Modul | Tabelat kryesore | Rregulla |
| --- | --- | --- |
| Lokal / siguri | venues, users, sessions, venue_allowed_networks | venue_id në çdo objekt biznesi; users.role manager/waiter; password_hash; active; sesione të revokueshme |
| Salla | dining_tables, orders, order_lines | Një porosi aktive për tavolinë për MVP; indeks unik parcial; version për ndryshime konkurruese |
| Menu | categories, products | Çmime në njësi monetare minimale integer; ALL si monedhë e supozuar; produktet çaktivizohen pa fshirë historinë |
| Inventar | stock_items, recipes, stock_movements, stock_balances | Ledger me hyrje/dalje, njësi bazë g/ml/copë, reçeta me numeric decimal; arsye dhe autor për korrigjime |
| Turnet | shifts, cash_movements | MVP: një turn arke aktiv për lokal; fond fillestar, hapës/mbyllës, pritshmëri, numërim, diferencë dhe arsye |
| Faturat | invoices, invoice_lines, payments, credit_notes | Snapshot emri/çmimi/takse; numër unik për lokal/seri; pa fshirje ose rishkrim të dokumentit të finalizuar |
| Gjurmimi | audit_events, idempotency_keys, print_jobs | Aktor, objekt, kohë, arsye; çelësa unikë dhe gjendje pune të qëndrueshme |

Foreign keys të përbëra `(venue_id, id)` parandalojnë lidhje mes lokaleve. CHECK për sasi pozitive në rreshta, pagesa pozitive dhe role të lejuara. Indekse mbi venue/status/created_at. Datat timestamptz UTC, shfaqja Europe/Tirane. Dokumentet historike nuk varen nga emrat/çmimet aktuale. Në prodhim ruaj vlerat monetare në nënnjësi, edhe kur UI shfaq Lek pa presje.

Inventari real i kafesë nuk është numër filxhanësh: espresso konsumon gramë kafe; cappuccino kafe dhe qumësht. Demo përdor njësi të shitshme për të provuar UX. Vendimi për prodhim: konfirmimi/dërgimi i porosisë konsumon përbërësit në ledger; pagesa nuk i konsumon përsëri. Anulimi pas përgatitjes regjistron humbje; nuk rikthen automatikisht ushqimin në stok. Kërkohet arsye menaxheri.

## Transaksionet

- Hapja e porosisë: verifiko sesionin, venue, rolin, IP-në dhe turnin; krijo nën kufizimin unik për tavolinën.
- Konfirmimi: kontroll versioni, lock mbi porosinë dhe balances në rend ID; verifiko disponueshmërinë; snapshot çmimesh nga serveri, lëvizje stoku dhe version i ri në një transaksion.
- Pagesa: kërko Idempotency-Key unik `(venue, operation, key)` me hash të payload-it; lock turnin dhe porosinë; prano vetëm porosi të hapur; llogarit totalin në server; krijo faturë, pagesë dhe print job atomikisht. Retry identik kthen të njëjtin rezultat; payload tjetër me të njëjtin key refuzohet. Pagesa e dyfishtë bllokohet me unique constraints.
- Mbyllja e turnit: lock i përbashkët me shtegun e porosive/pagesave që të shmanget race; blloko porositë e hapura; numëro cash. Pritshmëria = fondi + cash shitje + hyrje − rimbursime cash − dalje. Kartat nuk hyjnë në cash. Diferenca kërkon shpjegim.
- Përditësimet konkurruese përdorin version/If-Match; konfliktet 409 rifreskojnë UI dhe kërkojnë rishikim, pa mbishkrim të heshtur.
- Faturë e paguar: vetëm menaxheri mund të krijojë dokument korrigjues, me arsye dhe audit. Rregullat fiskale dhe integrimi konfirmohen sipas vendit të biznesit; ky prototip nuk fiskalizon.

## Login dhe IP restriction

Menaxheri krijon llogari kamarieri me identifikues unik dhe ftesë/kredencial fillestar njëpërdorimësh; ndërrim i detyrueshëm, skadim i ftesës. Hash Argon2id, jo fjalëkalime në plaintext. Rate limiting për llogari dhe IP, gabime login-i pa zbulim të ekzistencës së llogarisë, audit për dështime. MFA rekomandohet për menaxherët.

Sesioni është token opak kriptografik; hash në databazë. Cookie `__Host-session` me Secure, HttpOnly, SameSite dhe Path=/; rotacion pas login-it, afat idle dhe absolut; logout/çaktivizimi revokon sesionet. Kontroll Origin dhe CSRF për mutacionet. Mos ruaj bearer tokens në localStorage. [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

Për kamarierët zbato CIDR allowlist në login DHE çdo kërkesë të autentikuar, përfshirë reconnect dhe kohëzgjatjen e lidhjeve SSE. Normalizo IPv4/IPv6 me parser të provuar. Jashtë rrjetit kthe 403; konfigurimi bosh/mungues bllokon aksesin. Mos përdor IP private të telefonit: serveri cloud sheh IP-në publike të daljes së lokalit. Mobile data nuk kalon kontrollin. Për IP dinamike përdor IP fikse nga ISP ose VPN me dalje fikse; jo çaktivizim automatik të kontrollit.

Besim vetëm te proxy të përcaktuar; blloko hyrjen direkte në API. Proxy duhet të heqë/mbishkruajë forwarding headers nga klienti. `X-Forwarded-For` nuk është provë identiteti. Mos përdor `trustProxy: true` verbërisht. [Fastify trustProxy](https://fastify.dev/docs/latest/Reference/Server/). IP restriction është shtresë shtesë, jo zëvendësim i autentikimit. Politika për menaxherët jashtë lokalit kërkon vendim të shprehur.

Roli kontrollohet në server për çdo endpoint dhe çdo objekt: kamarieri sheh/ndryshon tavolinat e veta sipas politikës së lokalit; vetëm menaxheri menaxhon përdoruesit, IP-të, çmimet, stokun dhe dokumentet korrigjuese. Ndërruesi i rolit në demo është vetëm pamje, jo kontroll sigurie.

## Printera 88mm

MVP: HTML receipt i veçantë + print CSS + window.print. Letra e faturës është 88mm dhe përmbajtja 80mm me margjina 4mm; zgjidh driver-in, çaktivizo header/footer dhe shkallëzimin. `@page size:auto` respekton letrën e zgjedhur në driver; nuk ndryshon konfigurimin fizik të printerit. Testo ë/ç, emra të gjatë, prerje, margjina, faturë të gjatë dhe telefonin real. Dialogu i printimit nuk provon se letra u printua. [MDN print](https://developer.mozilla.org/en-US/docs/Web/API/Window/print), [CSS print](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Media_queries/Printing).

Printim automatik: agent lokal i autentikuar që tërheq print_jobs përmes TLS dhe flet ESC/POS me USB/LAN, ose SDK e prodhuesit kur modeli e mbështet. Agent me origin allowlist, payload të kufizuar, identitet printeri dhe pa port publik të hapur. Mbaj status queued/claimed/sent/failed/unknown, timeout dhe retry manual për gjendje të paqartë: dërgimi i përsëritur mund të printojë dy kopje. Rishkrimi shënon KOPJE; dështimi i printerit nuk anulon pagesën. Epson ka SDK JavaScript për modele të caktuara TM; nuk vlen për çdo printer 80mm. [Epson SDK](https://download3.ebz.epson.net/dsc/f/03/00/14/80/61/a342aeb40e985cce04f8b8f105d7995f145e54d3/ov_ePOS_SDK_JavaScript_v2.24.0a.pdf).

## API e propozuar

POST /auth/login, /auth/logout; GET /session.
GET/POST /tables, /products, /categories, /waiters; PATCH /waiters/:id.
POST /orders; PATCH /orders/:id/lines me version; POST /orders/:id/confirm; POST /orders/:id/pay.
GET /invoices; POST /invoices/:id/credit-notes dhe /print-jobs.
GET /stock; POST /stock/receipts dhe /stock/adjustments.
POST /shifts/open dhe /shifts/:id/close; GET /shifts/:id/reconciliation.
Validim server-side i skemës, body limits, query pagination, RBAC, venue scoping dhe audit për mutacionet.

## Offline, operim dhe implementim

MVP online-only për mutacionet. Në humbje rrjeti shfaq gjendjen dhe blloko pagesën/konfirmimin; mos shfaq sukses lokal të rremë. Retry përdor të njëjtin idempotency key. LocalStorage në demo nuk është strategji offline prodhimi. Offline-first real kërkon protokoll sinkronizimi dhe zakonisht shërbim lokal; vendoset veçmas.

Vendos API dhe Neon afër gjeografikisht. Konfiguro timeout, pool të kufizuar, health checks, log pa sekrete, monitorim gabimesh dhe audit të mbrojtur. SSE ose polling i lehtë për tavolinat; Redis nuk nevojitet në fillim. Politika backup/PITR sipas planit Neon dhe provë restore në staging. Migrimet additive para deploy-it dhe rollback i aplikacionit. Mos lidh prototipin me të dhëna reale.

Faza 1: validim UI në telefon/desktop dhe printer real. Faza 2: skema SQL, autentikim, IP restriction, role, testim autorizimesh. Faza 3: porosi, reçeta dhe transaksione pagesash/turnesh; teste konkurruese. Faza 4: printer agent, dokumente korrigjuese dhe integrim fiskal sipas juridiksionit. Faza 5: pilot me backup/restore, audit dhe provë rrjeti të ndërprerë.

Para prodhimit duhen: modeli/lidhja printerit, IP fikse apo dinamike, një/më shumë lokale, monedha, politika e tavolinave, turne për arkë apo kamarier, reçetat, sistemi fiskal dhe kërkesa offline.
