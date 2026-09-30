-- Printers on the print computer's USB (host "usb:<queue name>", sent raw through the
-- system's print queue), and printers whose firmware can't print ë/ç (ascii: send e/c).
ALTER TABLE bluebar.printers ADD COLUMN ascii boolean NOT NULL DEFAULT false;
-- Printers without a working cutter: never send a cut (a jammed cutter stops the
-- printer mid-receipt); feed the receipt out to the tear bar instead.
ALTER TABLE bluebar.printers ADD COLUMN cutter boolean NOT NULL DEFAULT true;
-- The USB printers the print computer reported, offered when adding a printer.
ALTER TABLE bluebar.print_agent ADD COLUMN usb_printers text[] NOT NULL DEFAULT '{}';
