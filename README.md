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

`npm run dev` nis API-në në `127.0.0.1:3001` dhe Vite në `127.0.0.1:5173` (ose portin pasues nëse është i zënë). `npm run api` dhe `npm run dev:web` i nisin veçmas. Serveri lokal refuzon NODE_ENV=production; publikimi në Vercel përdor `api/index.js` me HTTPS, cookies Secure dhe host/origin të lejuar.

## Neon

Ky projekt është lidhur me `wandering-rice-50334443`, dega `production`. Konfigurimi i kërkuar në `neon.ts` është `defineConfig({})`. `neon deploy` aplikon konfigurimin Neon dhe merr variablat; nuk publikon frontend-in dhe nuk ekzekuton migrimet SQL të BlueBar.

CLI ruan `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` dhe `NEON_BRANCH` në `.env`. Për një checkout të ri përdorni `.env.example`. Kredencialet qëndrojnë në server; asnjë URL databaze nuk duhet të ketë prefiksin `VITE_`. `.env` dhe `.neon` përjashtohen nga git. `DATABASE_URL_DIRECT`, kur vendoset, ka përparësi për migrimet; ndryshe përdoret URL-ja unpooled.

Migrimet në `server/migrations/` aplikohen në transaksion për çdo biznes. `server/tenant-catalog.sql` krijon katalogun e bizneseve. Instalimi ekzistues ruhet si biznesi `bluebar`, me të gjithë historikun e tij. Bizneset e reja nisin pa tavolina, kategori, produkte, staf, porosi, fatura ose turn të hapur.

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

Janë implementuar hyrja me PIN, sesionet HttpOnly, autorizimi menaxher/kamarier, ndarja mes bizneseve dhe IP restriction për çdo lokal. Ende nuk ka fiskalizim, reçeta përbërësish, printim automatik ose rikuperim PIN-i me email. Rikuperimi bëhet nga administratori me komandën e dokumentuar më poshtë. Historia lexohet e plotë brenda biznesit; pagination nevojitet për volum të madh.

Faturat shënohen JO FATURË FISKALE. Për printim vendosni letër 80mm në driver, scale 100% dhe hiqni header/footer; përmbajtja përdor 72mm. Testimi fizik kërkon printerin real.

Propozimi për fazat pasuese dhe sigurinë: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Hyrja dhe sigurimi

1. `npm run db:migrate` krijon tabelat e llogarive dhe sesioneve.
2. `npm run auth:manager -- emri kodi-biznesit` krijon menaxherin (ose e rivendos) dhe shfaq një herë PIN-in 6-shifror. Nëse kodi mungon, përdoret `bluebar`. Menaxheri fillestar i një biznesi të krijuar nga faqja quhet `manager`.
3. Menaxheri vendos PIN 6-shifror për çdo kamarier te Kamarierët. Pas 5 përpjekjeve të gabuara llogaria bllokohet 15 minuta.
4. Menaxheri vendos IP/CIDR te **Kamarierët → Rrjeti i lokalit**. Bizneset e reja refuzojnë hyrjen e kamarierëve derisa të konfigurohet rrjeti. `WAITER_ALLOWED_IPS` përdoret vetëm si konfigurim fillestar i biznesit legacy `bluebar`; ruajtja nga UI e zëvendëson. Pas proxy-t lokal vendosni `TRUST_PROXY` sipas rrjetit real.


## Multi-tenant

Në faqen kryesore zgjidhni **Biznes i ri? Krijo hapësirën**. Vendosni emrin, kodin unik dhe PIN-in e menaxherit. Linku `/?business=kodi-biznesit` mund të ndahet me stafin. PIN-et mund të jenë të njëjta në biznese të ndryshme pa bashkuar llogaritë.

Çdo biznes ka një skemë PostgreSQL të veçantë (`bluebar_<uuid>`), me të gjitha tabelat, foreign keys, sesionet, versionet dhe çelësat e deduplikimit brenda saj. Skema legacy mbetet `bluebar`. `bluebar_catalog.venues` lidh kodin publik me identifikuesin e brendshëm dhe rrjetet e lejuara.

Serveri zgjidh skemën nga katalogu dhe kërkon sesion të vlefshëm në atë skemë. Header-i i biznesit vetëm zgjedh kontekstin; nuk autorizon aksesin. Wrapper-i `tenantPool` përshtat vetëm SQL statik të serverit; vlerat e përdoruesit kalojnë gjithmonë si parametra. Nuk ndryshohet `search_path` i lidhjes dhe nuk ka kontekst global të ndryshueshëm mes kërkesave. Ky është izolim i zbatuar nga API dhe struktura e skemave, jo role të veçanta PostgreSQL/RLS për çdo biznes; databaza nuk ekspozohet klientëve.

Cookies dhe sessionStorage të komandave në pritje ndahen sipas biznesit, duke lejuar lokale të ndryshme në skeda të ndryshme. Biznesi ruan gjendjen pas logout/refresh. Krijimi i biznesit dhe migrimet serializohen me advisory lock dhe kryhen në transaksion; biznesi i dyfishuar refuzohet pa ndryshuar të dhëna. Regjistrimi kufizohet në databazë në 5 përpjekje/orë/IP.

Publikimi: provoni `npm run db:migrate` dhe `node scripts/verify-tenants-branch.js` në degë Neon të izoluar (verifikon `verifyTenants()` nga `server/verify-tenants.js` kundrejt Postgres real, jo vetëm PGlite). Pastaj aplikoni migrimin additive në production përpara publikimit të API-së. Kodi i vjetër vazhdon të funksionojë me biznesin `bluebar`; të dhënat ekzistuese nuk pastrohen. `npm run db:migrate` përditëson edhe skemat e të gjitha bizneseve të krijuara më vonë.
