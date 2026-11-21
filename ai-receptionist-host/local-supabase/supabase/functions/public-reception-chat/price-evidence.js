const LUXWASH_ORG = "09069b87-e02a-471d-977c-e4acd4e383b7";
const PRICE_PAGE = "https://www.luxwash.online/prijzen";
const CATALOG_URL = "https://www.luxwash.online/price-catalog.json";

const money = cents => "€" + (Number(cents || 0) / 100).toLocaleString("nl-BE", {
  minimumFractionDigits: Number(cents || 0) % 100 === 0 ? 0 : 2,
  maximumFractionDigits: 2
});
const unitLabel = unit => unit === "m²" ? "/m²" : unit === "stuk" ? "/stuk" : unit === "wagen" ? " per wagen" : "";

export function priceEvidence(profile) {
  if (profile.organization_id !== LUXWASH_ORG) return null;
  const instructions = String(profile.custom_instructions || "");
  const version = instructions.match(/Prijsversie: ([a-zA-Z0-9._-]+)\./)?.[1];
  if (!version) return null;
  return {
    version,
    source_url: PRICE_PAGE,
    catalog_url: CATALOG_URL,
    instructions,
    requires_operator_confirmation: true
  };
}

export function formatLuxWashPriceContext(catalog) {
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
  const base = catalog.prices.map(p =>
    p.name + ": " + (p.price_mode === "quote" ? "vanaf " : "") + money(p.amount_cents) + unitLabel(p.unit)
  ).join("; ");
  const addons = (catalog.vehicle_addons || []).map(p =>
    p.name + ": " + money(p.amount_cents) + unitLabel(p.unit) + (p.note ? " (" + p.note + ")" : "")
  ).join("; ");
  const surcharge = (catalog.surcharges || []).find(p =>
    p.applies_to === "COMBI — INTERIEUR + EXTERIEUR" && p.condition === "Break/SUV"
  );
  const combi = catalog.prices.find(p => p.name === "COMBI — INTERIEUR + EXTERIEUR");
  const combiSuv = combi && surcharge
    ? "COMBI interieur + exterieur Break/SUV: vanaf " + money(combi.amount_cents + surcharge.amount_cents) +
      " (basis " + money(combi.amount_cents) + " + SUV-toeslag " + money(surcharge.amount_cents) + ")."
    : "";
  const winter = (catalog.winter || []).filter(p => !p.valid_until || today <= p.valid_until)
    .map(p => p.name + ": " + money(p.amount_cents) + ", geldig t/m " + p.valid_until).join("; ");
  const travel = (catalog.travel || []).map(p =>
    (p.max_km === 10 ? "0–10 km" : p.max_km === 20 ? "10–20 km" : p.max_km === 30 ? "20–30 km" : "tot " + p.max_km + " km") +
    ": " + money(p.amount_cents)
  ).join("; ");
  const heavy = catalog.heavy_soiling
    ? "Zware vervuiling: mogelijk " + money(catalog.heavy_soiling.amount_cents) +
      " extra, alleen na beoordeling en voorafgaande persoonlijke bevestiging."
    : "";
  return [
    "LIVE OFFICIËLE LUXWASH-PRIJSCATALOGUS versie " + catalog.version + ". Bron: " + PRICE_PAGE + ".",
    "Basistarieven: " + base + ".",
    addons ? "Afzonderlijke autobehandeling: " + addons + "." : "",
    combiSuv,
    winter ? "Winteractie: " + winter + ". Geldig voor geschikte stoffen meubels, normale vervuiling en één bezoek op één adres; afwijkingen en verplaatsing vooraf bevestigen." : "",
    travel ? "Verplaatsing: " + travel + "; boven 30 km op aanvraag." : "",
    heavy,
    "Belangrijk onderscheid: dieptereiniging van autostoelen is een aparte behandeling per wagen; salonzetels gebruiken de afzonderlijke 1-zit-, 2-zit-, 3-zit- en hoekzeteltarieven.",
    "Als 'zetelreiniging' niet duidelijk maakt of het om autostoelen of een salonzetel gaat, stel eerst die ene verduidelijkingsvraag. Noem nooit de prijs voor autostoelen als salonzetelprijs.",
    "Alleen mobiele carwash wordt expliciet als 'aan huis' aangeboden; beloof dat niet voor meubelreiniging.",
    "Vanafprijzen zijn geen definitieve offertes. Bevestig de persoonlijke totaalprijs vóór de afspraak. Bestaande bevestigde offertes en afspraken behouden hun afgesproken prijs."
  ].filter(Boolean).join("\n");
}

export async function livePriceContext(profile) {
  if (profile.organization_id !== LUXWASH_ORG) return "";
  const fallbackInstructions = String(profile.custom_instructions || "");
  const expectedVersion = fallbackInstructions.match(/Prijsversie: ([a-zA-Z0-9._-]+)\./)?.[1];
  if (!expectedVersion) return "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(CATALOG_URL, {
      signal: controller.signal,
      cache: "no-store",
      headers: { "Accept": "application/json" }
    });
    if (!response.ok) return "";
    const catalog = await response.json();
    const hasAutoseat = Array.isArray(catalog.vehicle_addons) &&
      catalog.vehicle_addons.some(p => p.name === "Dieptereiniging autostoelen (alle zetels)" && p.amount_cents === 12500);
    const hasSuvSurcharge = Array.isArray(catalog.surcharges) &&
      catalog.surcharges.some(p => p.applies_to === "COMBI — INTERIEUR + EXTERIEUR" && p.condition === "Break/SUV" && p.amount_cents === 2000);
    const valid = catalog.version === expectedVersion &&
      catalog.source_url === PRICE_PAGE &&
      Array.isArray(catalog.prices) && catalog.prices.length >= 19 &&
      catalog.prices.every(p => Number.isInteger(p.amount_cents) && p.amount_cents >= 0) &&
      Array.isArray(catalog.winter) && Array.isArray(catalog.travel) &&
      hasAutoseat && hasSuvSurcharge;
    if (!valid) {
      console.warn("LUXWASH_PRICE_CATALOG mismatch; using pinned profile instructions");
      return "";
    }
    return formatLuxWashPriceContext(catalog);
  } catch (error) {
    console.warn("LUXWASH_PRICE_CATALOG unavailable; using pinned profile instructions", error instanceof Error ? error.message : String(error));
    return "";
  } finally {
    clearTimeout(timer);
  }
}
