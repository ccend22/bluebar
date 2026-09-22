# BlueBar

React + Vite, API Fastify dhe PostgreSQL në Neon. Ndërfaqe shqip për desktop/mobile, pa animacione ose bibliotekë UI të rëndë.

## Nisja lokale

Kërkohet Node.js >= 22.16.

```sh
npm install
npm run db:check
npm run db:migrate
npm run dev
```

`npm run dev` nis API-në në `127.0.0.1:3001` dhe Vite në `127.0.0.1:5173` (ose portin pasues nëse është i zënë). `npm run api` dhe `npm run dev:web` i nisin veçmas. API është qëllimisht vetëm lokale dhe refuzon nisjen në NODE_ENV=production derisa të implementohen login-i dhe autorizimi.

## Neon

Ky projekt është lidhur me `wandering-rice-50334443`, dega `production`. Konfigurimi i kërkuar në `neon.ts` është `defineConfig({})`. `neon deploy` aplikon konfigurimin Neon dhe merr variablat; nuk publikon frontend-in dhe nuk ekzekuton migrimet SQL të BlueBar.

CLI ruan `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` dhe `NEON_BRANCH` në `.env`. Për një checkout të ri përdorni `.env.example`. Kredencialet qëndrojnë në server; asnjë URL databaze nuk duhet të ketë prefiksin `VITE_`. `.env` dhe `.neon` përjashtohen nga git. `DATABASE_URL_DIRECT`, kur vendoset, ka përparësi për migrimet; ndryshe përdoret URL-ja unpooled.

Migrations në `server/migrations/` aplikohen në transaksion dhe regjistrohen në `bluebar.schema_migrations`. Migrimi fillestar krijon 12 tavolina dhe 4 kategori konfigurimi; nuk krijon produkte, staf, shitje ose para fillestare shembull. Përpara shërbimit: shtoni kamarier, produkte dhe stok, pastaj hapni turnin.

## Ruajtja dhe rrjedhat

Frontend-i ngarkon `/api/state` dhe dërgon komanda të validuara te `/api/commands`. Serveri llogarit çmimet, rezervimet, pagesat dhe turnet nga gjendja e databazës. Pagesat dhe stoku ruhen në një transaksion; faturat ruajnë snapshot të çmimit. Versionimi refuzon ndryshimet mbi gjendje të vjetër. Çdo komandë ka UUID për deduplikim; kur mungon përgjigjja, “Verifiko veprimin” riprovon të njëjtën komandë, jo një pagesë të re.

Gjendja rifreskohet çdo 10 sekonda dhe kur fokusohet dritarja. Të dhënat e vjetra `bluebar-demo-v1` në localStorage nuk lexohen, ndryshohen ose importohen. Vetëm kërkesa në pritje ruhet në sessionStorage për rikuperim pas rifreskimit. Nuk ka fallback offline që pretendon ruajtje në databazë.

## Testimi

```sh
npm test
npm run build
```

Testet përdorin PostgreSQL të integruar (PGlite) vetëm në zhvillim, për skemën, transaksionet, konfliktet, deduplikimin, çmimet, inventarin, turnet dhe kontrollet HTTP. Nuk prekin Neon. Migrimi dhe rrjedha React → API → Neon janë verifikuar edhe në një degë të përkohshme të ndarë nga production.

## Kufijtë aktualë

Lidhja me databazën është reale; roli në UI mbetet demonstrues. Ende nuk ka autentikim, autorizim menaxher/kamarier, kufizim IP për kamarierët, fiskalizim, reçeta përbërësish ose printim automatik. Mos ekspozoni API-në publike. Aksesi lokal verifikon Host, Origin dhe një header klienti; këto nuk janë zëvendësim për login.

Faturat shënohen JO FATURË FISKALE. Për printim vendosni letër 80mm në driver, scale 100% dhe hiqni header/footer; përmbajtja përdor 72mm. Testimi fizik kërkon printerin real.

Propozimi për fazat pasuese dhe sigurinë: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Hyrja dhe sigurimi

1. `npm run db:migrate` krijon tabelat e llogarive dhe sesioneve.
2. `npm run auth:manager -- emri` krijon menaxherin (ose e rivendos) dhe shfaq një herë PIN-in 6-shifror.
3. Menaxheri vendos PIN 6-shifror për çdo kamarier te Kamarierët. Pas 5 përpjekjeve të gabuara llogaria bllokohet 15 minuta.
4. Kamarierët hyjnë vetëm nga IP-të te `WAITER_ALLOWED_IPS` (bosh = vetëm lokalisht). Pas proxy-t vendosni `TRUST_PROXY`.
