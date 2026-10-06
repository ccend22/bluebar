import React, { useEffect, useRef } from "react";
import { money as lek } from "./domain.js";
import "./landing.css";

// The public page at "/": the kitchen pass at night. A steel rail runs down the page as
// its spine; every printout hanging from it is BlueBar's real printed format, every
// screen a real BlueBar screenshot. Sample data is labelled.
const REGISTER = "/?regjistro";
const SIGN_IN = "/?hyr";

// A sheet on the rail: the clip and the drop shadow live on this wrapper, because the
// paper's torn-edge mask would cut them off.
function Sheet({ children, tilt = 0, i = 0, wide, as: Tag = "div", ...props }) {
  return (
    <Tag className={`lp-sheet ${wide ? "wide" : ""}`} style={{ "--i": i, "--tilt": `${tilt}deg` }} {...props}>
      <div className="lp-paper">{children}</div>
    </Tag>
  );
}

// A department ticket as BlueBar prints it (see server/printing.js).
function Ticket({ dept, item, i, tilt }) {
  return (
    <Sheet i={i} tilt={tilt} tabIndex={0} aria-label={`Fleta e ${dept}: ${item}`}>
      <strong>{dept}</strong>
      <span className="lp-optional">POROSI PËR REPARTIN</span>
      <span>Tavolina 04</span>
      <span className="lp-optional">21:14 · Ana Krasniqi</span>
      <hr />
      <b>{item}</b>
    </Sheet>
  );
}

function Rail() {
  return <div className="lp-rail" aria-hidden="true" />;
}

function Arrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function Landing() {
  const page = useRef(null);
  // Sheets further down drop onto their rail when they come into view.
  useEffect(() => {
    const sheets = page.current.querySelectorAll(".lp-sheet");
    if (!("IntersectionObserver" in window)) return sheets.forEach((s) => s.classList.add("in"));
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add("in");
          io.unobserve(e.target);
        }),
      { threshold: 0.25 },
    );
    sheets.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  return (
    <div className="lp" ref={page}>
      <header className="lp-bar">
        <a className="lp-brand" href="/" aria-label="BlueBar, faqja kryesore">
          <span className="lp-brandmark" aria-hidden="true">b.</span>
          BlueBar
        </a>
        <nav aria-label="Llogaria">
          <a className="lp-link" href={SIGN_IN}>Hyr</a>
          <a className="lp-cta small" href={REGISTER}>Regjistro biznesin</a>
        </nav>
      </header>

      <main>
        <section className="lp-hero">
          <Rail />
          <div className="lp-hang lp-hero-tickets">
            <Ticket i={0} tilt={-2} dept="BAR" item="2 x Espresso" />
            <Ticket i={1} tilt={1.5} dept="KUZHINA" item="1 x Picë Margarita" />
            <Ticket i={2} tilt={-1} dept="ËMBËLTORE" item="1 x Tiramisu" />
          </div>
          <div className="lp-hero-copy">
            <h1>
              Çdo porosi,
              <br />
              te reparti i vet.
            </h1>
            <p>
              Kamarieri porosit nga telefoni. Bari, kuzhina dhe ëmbëltorja marrin secila fletën e vet, në printerin e vet.
              Në fund, një faturë e vetme, e fiskalizuar.
            </p>
            <div className="lp-actions">
              <a className="lp-cta" href={REGISTER}>Regjistro biznesin</a>
              <a className="lp-link" href={SIGN_IN}>Kam një biznes · Hyr</a>
            </div>
            <p className="lp-sample">Fletët dhe ekranet në këtë faqe janë shembull.</p>
          </div>
        </section>

        <section className="lp-row">
          <div className="lp-copy">
            <h2>Një prekje te tavolina.</h2>
            <p>
              Kamarieri hap tavolinën në telefon, zgjedh produktet dhe shtyp “Dërgo në repartet”. BlueBar e ndan porosinë
              vetë: kafeja te bari, pica te kuzhina, ëmbëlsira te ëmbëltorja.
            </p>
            <ul className="lp-points">
              <li>Pa letra që humbasin, pa shkrim që nuk lexohet.</li>
              <li>Kamarieri nuk e heq dot një produkt që është dërguar.</li>
              <li>Raundi i dytë dërgon vetëm të rejat.</li>
            </ul>
          </div>
          <figure className="lp-screen lp-screen-phone">
            <img
              src="/landing/waiter-order.webp"
              width="390"
              height="780"
              alt="BlueBar në telefonin e kamarierit: Tavolina 04 me 2 Espresso, 1 Picë Margarita, 1 Tiramisu dhe butoni Dërgo në repartet"
              loading="lazy"
            />
          </figure>
        </section>

        <section className="lp-pass">
          <Rail />
          <Sheet wide tilt={0.6} tabIndex={0} aria-label="Shembull fature e fiskalizuar">
            <strong className="lp-receipt-brand">BlueBar</strong>
            <span className="lp-center">FATURË E FISKALIZUAR</span>
            <span className="lp-line"><span>Fatura D-128</span><span>Tavolina 04</span></span>
            <span className="lp-center">01.10.2026 · 21:40 · Ana Krasniqi</span>
            <hr />
            <span className="lp-line"><span>2 x Espresso</span><span>{lek(200)}</span></span>
            <span className="lp-line"><span>1 x Picë Margarita</span><span>{lek(550)}</span></span>
            <span className="lp-line"><span>1 x Tiramisu</span><span>{lek(300)}</span></span>
            <hr />
            <span className="lp-line lp-total"><span>TOTALI</span><span>{lek(1050)}</span></span>
            <span className="lp-center">Pagesa: Kartë</span>
            <hr />
            <span className="lp-small">NIVF: shembull-3f9a…c21e</span>
            <span className="lp-small">NSLF: shembull-7b1d…04aa</span>
            <span className="lp-center lp-thanks">Faleminderit për vizitën!</span>
          </Sheet>
          <div className="lp-copy">
            <h2>
              Një faturë. E&nbsp;plotë. E&nbsp;fiskalizuar.
            </h2>
            <p>
              Kur klienti paguan, BlueBar nxjerr një faturë të vetme për gjithë tavolinën. Lidhni BlueBill një herë te
              Cilësimet, dhe çdo faturë fiskalizohet vetë dhe printohet te arka.
            </p>
            <ul className="lp-points">
              <li>Cash ose kartë: kusuri llogaritet vetë.</li>
              <li>Fatura del e gjatë sa duhet, pa u prerë në mes.</li>
            </ul>
          </div>
        </section>

        <section className="lp-floor">
          <div className="lp-copy">
            <h2>Menaxheri sheh gjithë sallën.</h2>
            <p>
              Tavolinat e zëna, porositë e hapura dhe shumat, live, nga kompjuteri ose telefoni, edhe kur nuk është në
              lokal.
            </p>
          </div>
          <figure className="lp-screen lp-screen-wide">
            <img
              src="/landing/manager-floor.webp"
              width="1200"
              height="387"
              alt="Salla në BlueBar: tre tavolina të zëna me shumat e tyre dhe totali i porosive të hapura, 3.550 Lek"
              loading="lazy"
            />
          </figure>
        </section>

        <section className="lp-pass">
          <Rail />
          <Sheet wide tilt={-0.8} tabIndex={0} aria-label="Shembull raporti i turnit">
            <strong>RAPORTI I TURNIT</strong>
            <span className="lp-center">Turni #12 · 18:00–02:10</span>
            <hr />
            <span className="lp-line"><span>Fondi fillestar</span><span>{lek(15000)}</span></span>
            <span className="lp-line"><span>+ Shitje cash</span><span>{lek(41800)}</span></span>
            <span className="lp-line"><span>+ Hyrje në arkë</span><span>{lek(2000)}</span></span>
            <span className="lp-line"><span>− Dalje nga arka</span><span>{lek(500)}</span></span>
            <hr />
            <span className="lp-line lp-total"><span>Pritet në arkë</span><span>{lek(58300)}</span></span>
            <span className="lp-line"><span>Numëruar</span><span>{lek(58300)}</span></span>
            <span className="lp-line lp-total"><span>DIFERENCA</span><span>{lek(0)}</span></span>
          </Sheet>
          <div className="lp-copy">
            <h2>Arka mbyllet e saktë.</h2>
            <p>
              Në fillim të turnit shkruani sa para ka arka. Gjatë natës shënoni çdo para që hyn ose del. Në fund numëroni,
              dhe BlueBar ju tregon nëse mungon apo tepron diçka.
            </p>
            <ul className="lp-points">
              <li>Raport për çdo turn, edhe i printuar.</li>
              <li>Stoku zbritet vetë me çdo shitje.</li>
            </ul>
          </div>
        </section>

        <section className="lp-pass">
          <Rail />
          <Sheet wide tilt={0.9} tabIndex={0} aria-label="Fleta e provës së printerit">
            <strong className="lp-receipt-brand">BlueBar</strong>
            <span className="lp-center">PROVË PRINTIMI</span>
            <hr />
            <span className="lp-line"><span>Printeri</span><span>Bari</span></span>
            <span className="lp-line"><span>Lidhja</span><span>WiFi · 192.168.1.50</span></span>
            <span>Repartet: Bar</span>
            <span>Shkronjat: ë Ë ç Ç</span>
            <hr />
            <span className="lp-center">Nëse e lexoni këtë, printeri punon.</span>
          </Sheet>
          <div className="lp-copy">
            <h2>Me pajisjet dhe printerat që keni.</h2>
            <p>
              BlueBar punon në telefon, tablet dhe kompjuter: Windows, Mac ose Linux, dhe instalohet si aplikacion.
              Printerat e faturave lidhen me kabllo interneti, WiFi, ose me USB te kompjuteri i lokalit (Mac, Linux).
            </p>
            <ul className="lp-points">
              <li>Te Cilësimet shtypni “Lidh një kompjuter”. Pastaj punon vetë.</li>
              <li>Kamarierët hyjnë me emër dhe PIN, vetëm me PIN, ose me një vizatim me gisht.</li>
              <li>Vetëm nga WiFi-ja e lokalit.</li>
            </ul>
          </div>
        </section>

        <section className="lp-close">
          <Rail />
          <Sheet as="a" href={REGISTER} tilt={0}>
            <strong>POROSI E RE</strong>
            <span>Lokali juaj</span>
            <hr />
            <b>1 x BlueBar</b>
            <span className="lp-new-cta">
              Regjistro biznesin <Arrow />
            </span>
          </Sheet>
          <h2>Hapeni lokalin tuaj në BlueBar.</h2>
          <p>Shkruani emrin e lokalit, një kod të shkurtër për stafin dhe një PIN për veten.</p>
          <a className="lp-link" href={SIGN_IN}>Kam një biznes · Hyr</a>
        </section>
      </main>

      <footer className="lp-footer">
        <span className="lp-brand">
          <span className="lp-brandmark" aria-hidden="true">b.</span>
          BlueBar
        </span>
        <span>Në ritmin e lokalit tuaj.</span>
      </footer>
    </div>
  );
}
