import { Router } from "express";
import { ah } from "../lib/http.js";

/**
 * Stedssøk for hjemsted-innstillingen, proxet mot Kartverkets åpne
 * stedsnavn-API (ingen nøkkel, norske stedsnavn). Proxes via serveren for å
 * slippe CORS og for å holde klienten uavhengig av tredjeparts-endepunkter.
 * https://api.kartverket.no/stedsnavn/v1
 */

const KARTVERKET_URL = "https://api.kartverket.no/stedsnavn/v1/navn";
const USER_AGENT = "treningsapp-10k/1.0 github.com/lucide85/run";

interface KartverketNavn {
  ["skrivemåte"]?: string;
  navneobjekttype?: string;
  representasjonspunkt?: { nord?: number; ["øst"]?: number };
  kommuner?: { kommunenavn?: string }[];
  fylker?: { fylkesnavn?: string }[];
}

export interface GeoHit {
  name: string;
  type: string;
  municipality: string | null;
  county: string | null;
  lat: number;
  lon: number;
}

// Typiske bosteder først i lista
const TYPE_PRIORITY = ["by", "tettsted", "bygd", "tettbebyggelse", "grend", "bydel", "kommune"];

export const geoRouter = Router();

geoRouter.get("/search", ah(async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) return res.json({ hits: [] });

  const url =
    `${KARTVERKET_URL}?sok=${encodeURIComponent(q)}` +
    `&fuzzy=true&utkoordsys=4258&treffPerSide=15&side=1`;
  const resp = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!resp.ok) {
    console.error("Kartverket-søk feilet:", resp.status);
    return res.status(502).json({ error: "Stedssøket er utilgjengelig akkurat nå." });
  }
  const body = (await resp.json()) as { navn?: KartverketNavn[] };

  const seen = new Set<string>();
  const hits: GeoHit[] = [];
  for (const n of body.navn ?? []) {
    const name = n["skrivemåte"];
    const rp = n.representasjonspunkt;
    if (!name || rp?.nord == null || rp?.["øst"] == null) continue;
    const municipality = n.kommuner?.[0]?.kommunenavn ?? null;
    const key = `${name}|${municipality}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({
      name,
      type: n.navneobjekttype ?? "",
      municipality,
      county: n.fylker?.[0]?.fylkesnavn ?? null,
      lat: Math.round(rp.nord * 10000) / 10000,
      lon: Math.round(rp["øst"] * 10000) / 10000,
    });
  }

  hits.sort((a, b) => {
    const pa = TYPE_PRIORITY.indexOf(a.type.toLowerCase());
    const pb = TYPE_PRIORITY.indexOf(b.type.toLowerCase());
    return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
  });

  res.json({ hits: hits.slice(0, 8) });
}));
