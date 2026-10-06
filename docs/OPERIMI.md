# BlueBar — operimi, besueshmëria dhe puna pa internet

Ky dokument përshkruan si sillet BlueBar kur diçka shkon keq: interneti bie, një pajisje rinis, printeri nuk përgjigjet. Përshkruan vetëm atë që është zbatuar. Çdo pikë ka testin që e verifikon (`npm test`).

## Puna pa internet

BlueBar është sistem **online**. Porositë, stoku, pagesat dhe turnet ruhen vetëm në server, sepse shumë pajisje punojnë mbi të njëjtat të dhëna dhe vetëm serveri mund të vendosë cila ndryshim vlen.

**Çfarë funksionon kur bie interneti**

- Aplikacioni hapet: faqja dhe skedarët e saj ruhen në pajisje (service worker). Nuk shfaqet faqja e gabimit e shfletuesit, por mesazhi "Pa lidhje".
- Të dhënat e fundit të ngarkuara (tavolinat, porositë) mbeten në ekran. Veprimet që kërkojnë serverin provohen dhe refuzohen me mesazh; nuk shfaqet sukses i rremë.
- Shtimet dhe heqjet e artikujve në një porosi pranohen në ekran dhe ruhen në radhë te pajisja. Dërgohen vetë kur kthehet lidhja, me të njëjtin identifikues, prandaj nuk dyfishohen.

**Çfarë bllokohet derisa të kthehet lidhja**

- Dërgimi në repart, pagesa, anulimi, turnet, arka, inventari dhe çdo ndryshim konfigurimi.
- Printimi nga printerët e rrjetit: kompjuteri i printimit merr punët nga serveri.
- Raportet.

**Kufizim i rëndësishëm:** radha e artikujve ruhet në `sessionStorage`. Ajo mbijeton rifreskimin e faqes, por **jo mbylljen e skedës ose të aplikacionit**. Nëse pajisja mbyllet pa lidhje, artikujt e shtuar pa lidhje humbasin dhe duhen rishtuar.

BlueBar **nuk** ka modalitet të plotë offline (pagesa ose fatura pa internet, sinkronizim i mëvonshëm). Një gjë e tillë do të kërkonte shërbim lokal në lokal dhe zgjidhje konfliktesh; nuk është zbatuar.

## Ndërprerja gjatë dërgimit ose pagesës

Çdo veprim ka një identifikues unik, të krijuar nga pajisja para dërgimit dhe të ruajtur te pajisja.

- Nëse përgjigjja e serverit nuk arrin, pajisja tregon "Rezultati i veprimit nuk u verifikua" dhe ofron **Verifiko veprimin**. Ky e dërgon sërish të njëjtin veprim me të njëjtin identifikues.
- Serveri e njeh identifikuesin: nëse veprimi ishte kryer, kthen të njëjtin rezultat pa e përsëritur. Nëse nuk ishte kryer, e kryen tani. **Një pagesë nuk regjistrohet dy herë.**
- I njëjti identifikues me përmbajtje tjetër refuzohet.

Testi: `server/reliability.test.js` → "a payment retried after a dropped connection is applied once".

## Disa pajisje njëkohësisht

Çdo ndryshim mbart versionin e të dhënave që pajisja kishte parë. Nëse një pajisje tjetër ka ndryshuar ndërkohë, ndryshimi refuzohet (409), pajisja rifreskon dhe përdoruesi provon sërish. Asgjë nuk mbishkruhet në heshtje. Në Postgres, rreshti i versionit kyçet brenda transaksionit (`FOR UPDATE`), prandaj dy shkrime të njëkohshme renditen njëri pas tjetrit.

Testi: "two devices changing the same venue…".

## Rinisja e serverit ose e pajisjes

- Serveri nuk mban asgjë vetëm në memorie: porositë e hapura, fletët e reparteve dhe punët e printimit janë në databazë.
- Pajisja, pas rifreskimit, ngarkon gjendjen nga serveri. Veprimi i pasigurt dhe radha e artikujve ruhen te skeda (shih kufizimin më lart).

Testi: "after a server restart, open orders, tickets and queued prints are all still there".

## Printerët

- Printimi është pasojë e veprimit, jo kusht i tij: një printer pa lidhje **nuk** e anulon dhe nuk e bllokon shitjen.
- Puna e printimit riprovohet për **20 minuta**. Pas kësaj nuk printohet më vetë, sepse një fletë kuzhine e vonuar më shumë bën më shumë dëm se dobi: përdorni "Printo sërish". Printeri që dështon shfaqet te Cilësimet → Kontrolli i konfigurimit.
- **Rezultat i pasigurt:** nëse printeri e mori fletën, por konfirmimi nuk arriti, puna mund të riprovohet dhe fleta të dalë dy herë. Dublikata është më e sigurt se fleta e humbur. "Printo sërish" krijon gjithmonë një kopje të re.
- Stacionet pa printer përdorin ekranin te Repartet, i cili lajmëron serverin çdo minutë. Kontrolli i konfigurimit e tregon stacionin pa asnjë pajisje që punon.

Testi: "a printer that fails keeps its job queued, is reported, and the sale is unaffected".

## Historiku financiar dhe operacional

- Fatura ruan emrat dhe çmimet në momentin e shitjes. Ndryshimi i çmimit ose i emrit të produktit nuk e prek.
- Nuk ka fshirje ose ndryshim të faturës së paguar. Tavolina me fatura nuk fshihet, vetëm çaktivizohet.
- Çdo ndryshim në porosi (shtim, heqje, anulim, dërgim, transferim, pagesë) ruhet me orën dhe personin. Shihet te porosia dhe te fatura.
- Stoku zbritet vetëm në pagesë. **Anulimi nuk e rikthen stokun automatikisht.** Një produkt i përgatitur dhe i papaguar regjistrohet me dorë te Inventari → "Korrigjim / humbje", me arsye.
- Një pagesë nuk fshihet. Paratë kthehen me **rimbursim**: vetëm menaxheri, me arsye, kurrë më shumë se fatura. Rimbursimi cash del nga arka e turnit të hapur. Rimbursimi nuk e rikthen stokun dhe nuk dërgohet automatikisht te tatimet.

Testi: "financial history doesn't move…".

## Izolimi mes bizneseve

Çdo biznes ka skemën e vet në databazë (`bluebar_<id>`). Sesioni, cookie-t dhe kodet lidhen me biznesin. Një sesion i një biznesi nuk lexon dhe nuk ndryshon të dhënat e një tjetri.

Testi: `server/tenants.test.js`.

## Ruajtja dhe kopjet rezervë

- Të dhënat ruhen në Neon PostgreSQL. Çdo ndryshim bëhet në një transaksion të vetëm: ose ruhet i tëri, ose aspak.
- Neon mban historikun e ndryshimeve dhe lejon kthim në një moment të kaluar (point-in-time restore). Kohëzgjatja e këtij historiku varet nga plani Neon: **kontrolloni dhe vendosni në konsolën Neon** sa ditë mbahet.
- Rekomandim, ende **pa automatizuar**: një eksport javor (`pg_dump`) jashtë Neon, dhe një provë rikthimi në një degë (branch) Neon një herë në muaj. Pa provë rikthimi, kopja rezervë nuk është e verifikuar.

## Llogaritë dhe pagesat

- **Detyrimi** = artikujt − qerasjet − ulja. **Paguar** dhe **Mbetur** llogariten nga serveri dhe shfaqen te porosia dhe te pagesa.
- Një llogari paguhet e gjitha, pjesë-pjesë (p.sh. 1/3 secili), ose sipas artikujve (artikujt e zgjedhur dalin në faturë më vete). Një pagesë mund të jetë cash + kartë.
- **Asnjë detyrim nuk arkëtohet dy herë.** Shuma mbi mbetjen refuzohet. Dy pajisje që paguajnë të njëjtën mbetje: e dyta refuzohet (409), sepse llogaria ka ndryshuar. I njëjti veprim i riprovuar pas ndërprerjes nuk përsëritet.
- **Bakshishi** ruhet më vete dhe nuk hyn te shitjet. Kur paguhet cash, është në arkë derisa t'i jepet stafit: regjistrojeni si "Dalje" kur e jepni.
- **Uljet dhe qerasjet** janë të menaxherit, me arsye, dhe shkojnë në historikun e porosisë.
- **Zhvendosja mes kasave:** llogaria paguhet te kasa e tavolinës ku përfundon, dhe ajo kasë duhet të ketë turn të hapur. Një llogari që ka pagesa të pjesshme **nuk** kalon në kasë tjetër, sepse paratë e marra janë në arkën e parë. Fletët e reparteve nuk ridrejtohen: stacioni i shërben tavolinës së re.
- **Kufizim i fiskalizimit:** BlueBill pranon një mënyrë pagese për faturë. Fatura cash + kartë raportohet me pjesën më të madhe. Një faturë 0 Lek (e qerasur e tëra) nuk fiskalizohet.

## Raportet: çfarë tregojnë dhe çfarë jo

- **Shitjet** janë faturat. **Arkëtimet** ndahen në cash, që hyn në arkë, dhe bankë (kartë/POS). **Gjendja e arkës** llogaritet për çdo turn: fondi + arkëtimet cash + bakshishi cash + hyrjet − daljet − rimbursimet cash. Këto tri gjëra nuk ngatërrohen.
- "Sipas datës" numëron faturën te dita kur u pagua. "Sipas turnit" e numëron te dita kur u hap turni. Kështu turni që kalon mesnatën nuk ndahet në dy ditë.
- **Fitimi nuk llogaritet:** BlueBar nuk njeh ende koston e mallit dhe pagat.

## Inventari: hapat

1. **I zbatuar:** pragu minimal për produkt, heqja e përkohshme nga menuja, korrigjimet dhe humbjet me arsye dhe person.
2. **Hapi tjetër:** recetat (përbërës, njësi matëse: g, ml, copë) dhe konsumi i tyre në shitje.
3. **Më pas:** gjendje sipas vendndodhjes (magazina, secili bar) dhe transferime mes tyre.
