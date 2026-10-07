export const itineraryStyles = `
@page { size: A4; margin: 16mm 14mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; background: #fff; color: #111; font-family: Georgia, "Times New Roman", serif; font-size: 12pt; line-height: 1.5; }
main.itinerary { max-width: 760px; margin: 0 auto; padding: 24px 18px; }
main.itinerary, main.itinerary * { overflow-wrap: anywhere; word-break: normal; }
p, li { white-space: pre-line; margin: 0 0 8px; }
.brand { font: 700 11pt system-ui, -apple-system, "Segoe UI", sans-serif; letter-spacing: .08em; text-transform: uppercase; color: #183a36; border-bottom: 3px solid #d86543; display: inline-block; padding-bottom: 4px; }
.kicker { font: 600 9pt system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; margin: 16px 0 4px; color: #333; }
h1 { font-size: 26pt; line-height: 1.15; margin: 0 0 8px; break-after: avoid; page-break-after: avoid; }
h2, h3, h4 { break-after: avoid; page-break-after: avoid; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
h2 { font-size: 15pt; margin: 22px 0 8px; border-bottom: 1px solid #111; padding-bottom: 4px; }
h3 { font-size: 13pt; margin: 0 0 4px; }
h4 { font-size: 10pt; text-transform: uppercase; letter-spacing: .06em; margin: 10px 0 4px; }
.description { font-size: 13pt; }
.summary, .snapshot-time { font: 10pt system-ui, sans-serif; color: #222; }
.route-figure { margin: 18px 0; break-inside: avoid; page-break-inside: avoid; }
.route-figure svg { display: block; width: 100%; height: auto; max-height: 680px; margin: 0 auto; border: 1px solid #111; background: #fff; }
.route-credit { font: 9pt system-ui, sans-serif; color: #222; margin-top: 4px; }
article.stop { border-left: 4px solid #183a36; padding: 4px 0 4px 12px; margin: 0 0 16px; }
.place { font: 600 10pt system-ui, sans-serif; color: #183a36; }
.story { margin-bottom: 8px; }
section.access ul { margin: 0 0 6px; padding-left: 20px; }
.notes { font-size: 10pt; }
footer { margin-top: 28px; padding-top: 10px; border-top: 2px solid #111; font: 9.5pt/1.45 system-ui, sans-serif; }
@media print { main.itinerary { padding: 0; max-width: none; } .route-figure svg { max-height: 175mm; } a { color: #111; } }
`;
