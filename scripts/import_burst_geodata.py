#!/usr/bin/env python3
import json, math, os, urllib.parse, urllib.request
from pathlib import Path

OUT = Path("dender-county-3d/geodata")
OUT.mkdir(parents=True, exist_ok=True)

# First exact migration sector: Burst + immediate approaches.
BBOX = {
    "south": 50.8950,
    "west": 3.8950,
    "north": 50.9320,
    "east": 3.9470,
}
CENTER = {"lat": 50.91365, "lon": 3.92037}

UA = "DenderCounty-GeodataImporter/0.9 (+https://dender-county-3d.onrender.com/)"

def get_json(url, data=None, timeout=90):
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "User-Agent": UA,
            "Accept": "application/json, application/geo+json;q=0.9, */*;q=0.1",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)

def overpass():
    b = BBOX
    bbox = f'{b["south"]},{b["west"]},{b["north"]},{b["east"]}'
    q = f"""[out:json][timeout:80];
(
  way["highway"]({bbox});
  way["railway"]({bbox});
  node["railway"="station"]({bbox});
  node["place"~"village|hamlet|town"]({bbox});
);
out tags geom;"""
    data = urllib.parse.urlencode({"data": q}).encode()
    endpoints = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
    ]
    last = None
    for ep in endpoints:
        try:
            return get_json(ep, data=data, timeout=120)
        except Exception as e:
            last = e
    raise RuntimeError(f"Overpass failed: {last}")

def osm_to_geojson(raw):
    features = []
    street_names = set()
    for e in raw.get("elements", []):
        tags = e.get("tags", {})
        if e.get("type") == "way" and e.get("geometry"):
            coords = [[p["lon"], p["lat"]] for p in e["geometry"]]
            kind = "road" if "highway" in tags else "railway" if "railway" in tags else "other"
            props = {
                "source": "OpenStreetMap",
                "source_id": f'way/{e["id"]}',
                "kind": kind,
                "name": tags.get("name"),
                "ref": tags.get("ref"),
                "highway": tags.get("highway"),
                "railway": tags.get("railway"),
                "surface": tags.get("surface"),
                "maxspeed": tags.get("maxspeed"),
                "lanes": tags.get("lanes"),
                "oneway": tags.get("oneway"),
                "cycleway": tags.get("cycleway"),
                "foot": tags.get("foot"),
            }
            if kind == "road" and tags.get("name"):
                street_names.add(tags["name"])
            features.append({
                "type": "Feature",
                "id": props["source_id"],
                "properties": props,
                "geometry": {"type": "LineString", "coordinates": coords},
            })
        elif e.get("type") == "node" and "lat" in e and "lon" in e:
            if tags.get("railway") == "station" or tags.get("place"):
                features.append({
                    "type": "Feature",
                    "id": f'node/{e["id"]}',
                    "properties": {
                        "source": "OpenStreetMap",
                        "source_id": f'node/{e["id"]}',
                        "kind": "station" if tags.get("railway") == "station" else "place",
                        "name": tags.get("name"),
                        "place": tags.get("place"),
                        "railway": tags.get("railway"),
                    },
                    "geometry": {"type": "Point", "coordinates": [e["lon"], e["lat"]]},
                })
    return {
        "type": "FeatureCollection",
        "name": "Burst real-world pilot sector",
        "bbox": [BBOX["west"], BBOX["south"], BBOX["east"], BBOX["north"]],
        "features": features,
    }, sorted(street_names)

def nominatim_boundary(query):
    qs = urllib.parse.urlencode({
        "q": query,
        "format": "jsonv2",
        "limit": 1,
        "polygon_geojson": 1,
    })
    data = get_json("https://nominatim.openstreetmap.org/search?" + qs, timeout=60)
    if not data:
        return None
    r = data[0]
    return {
        "type": "Feature",
        "properties": {
            "source": "OpenStreetMap/Nominatim",
            "osm_type": r.get("osm_type"),
            "osm_id": r.get("osm_id"),
            "display_name": r.get("display_name"),
        },
        "geometry": r.get("geojson"),
    }

def geometry_bbox(geom):
    xs, ys = [], []
    def walk(c):
        if isinstance(c, list) and len(c) >= 2 and isinstance(c[0], (int, float)) and isinstance(c[1], (int, float)):
            xs.append(c[0]); ys.append(c[1])
        elif isinstance(c, list):
            for q in c: walk(q)
    if geom: walk(geom.get("coordinates"))
    if not xs: return None
    return min(xs), min(ys), max(xs), max(ys)

def overlaps_sector(geom):
    bb = geometry_bbox(geom)
    if not bb: return False
    minx, miny, maxx, maxy = bb
    return not (maxx < BBOX["west"] or minx > BBOX["east"] or maxy < BBOX["south"] or miny > BBOX["north"])

def normalize_official_roads(data):
    out = []
    for ft in data.get("features", []):
        if not overlaps_sector(ft.get("geometry")):
            continue
        p = ft.get("properties", {})
        left = (p.get("linkerstraatnaam") or "").strip()
        right = (p.get("rechterstraatnaam") or "").strip()
        name = left or right or None
        out.append({
            "type": "Feature",
            "id": f'wegenregister/{p.get("objectId")}',
            "properties": {
                "source": "Digitaal Vlaanderen Wegenregister",
                "source_id": f'wegenregister/{p.get("objectId")}',
                "kind": "road",
                "name": name,
                "left_name": left or None,
                "right_name": right or None,
                "status": p.get("wegsegmentstatus"),
                "road_class": p.get("morfologischeWegklasse"),
                "road_category": p.get("wegcategorie"),
                "access": p.get("toegangsbeperking"),
                "manager": p.get("labelWegbeheerder"),
            },
            "geometry": ft.get("geometry"),
        })
    return out

def official_wegenregister_probe():
    base = "https://geo.api.vlaanderen.be/Wegenregister/ogc/features/v1"
    result = {"endpoint": base, "reachable": False, "collection_id": None, "feature_count": 0, "sector_feature_count": 0}
    try:
        collections = get_json(base + "/collections?f=json", timeout=45)
        result["reachable"] = True
        for c in collections.get("collections", []):
            hay = (str(c.get("id","")) + " " + str(c.get("title",""))).lower()
            if "wegsegment" in hay:
                result["collection_id"] = c.get("id")
                break
        cid = result["collection_id"]
        if cid:
            b = BBOX
            params = urllib.parse.urlencode({
                "bbox": f'{b["west"]},{b["south"]},{b["east"]},{b["north"]}',
                "limit": 10000,
                "f": "json",
            })
            data = get_json(f"{base}/collections/{urllib.parse.quote(str(cid))}/items?{params}", timeout=90)
            if data.get("type") == "FeatureCollection":
                result["feature_count"] = len(data.get("features", []))
                clipped = {
                    "type": "FeatureCollection",
                    "name": "Burst - Digitaal Vlaanderen Wegenregister",
                    "bbox": [BBOX["west"], BBOX["south"], BBOX["east"], BBOX["north"]],
                    "features": normalize_official_roads(data),
                }
                result["sector_feature_count"] = len(clipped["features"])
                (OUT / "burst_wegenregister.geojson").write_text(
                    json.dumps(clipped, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
                )
    except Exception as e:
        result["error"] = type(e).__name__ + ": " + str(e)
    return result

def main():
    raw = overpass()
    geo, streets = osm_to_geojson(raw)
    (OUT / "burst.geojson").write_text(
        json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    boundaries = {
        "type": "FeatureCollection",
        "features": [
            x for x in [
                nominatim_boundary("Burst, Erpe-Mere, Belgium"),
                nominatim_boundary("Erpe-Mere, Belgium"),
            ] if x and x.get("geometry")
        ],
    }
    (OUT / "burst_boundaries.geojson").write_text(
        json.dumps(boundaries, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    official = official_wegenregister_probe()

    # Runtime layer: official Flemish road geometry first; OSM only for rail/place/station supplements.
    official_fc = {"type":"FeatureCollection","features":[]}
    official_path = OUT / "burst_wegenregister.geojson"
    if official_path.exists():
        official_fc = json.loads(official_path.read_text(encoding="utf-8"))
    supplements = [
        ft for ft in geo["features"]
        if ft.get("properties", {}).get("kind") in ("railway", "station", "place")
    ]
    runtime = {
        "type": "FeatureCollection",
        "name": "Burst runtime geography",
        "bbox": [BBOX["west"], BBOX["south"], BBOX["east"], BBOX["north"]],
        "features": official_fc.get("features", []) + supplements,
    }
    (OUT / "burst_runtime.geojson").write_text(
        json.dumps(runtime, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    official_streets = sorted({
        ft.get("properties", {}).get("name")
        for ft in official_fc.get("features", [])
        if ft.get("properties", {}).get("name")
    })

    meta = {
        "sector": "Burst",
        "municipality": "Erpe-Mere",
        "country": "Belgium",
        "center_wgs84": CENTER,
        "bbox_wgs84": BBOX,
        "world_scale": "1 real metre = 1 game metre",
        "runtime_geometry_source": "Digitaal Vlaanderen Wegenregister (roads) + OpenStreetMap (rail/station/place supplements)",
        "official_validation_source": "Digitaal Vlaanderen Wegenregister OGC API Features",
        "wegenregister": official,
        "osm_attribution": "© OpenStreetMap contributors, ODbL",
        "official_attribution_note": "Use Digitaal Vlaanderen source attribution rules for official data.",
        "street_count_named": len(official_streets) if official_streets else len(streets),
        "street_names": official_streets if official_streets else streets,
        "feature_count": len(geo["features"]),
        "runtime_feature_count": len(runtime["features"]),
        "generated_by": "scripts/import_burst_geodata.py",
    }
    (OUT / "burst_meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({
        "features": meta["feature_count"],
        "runtime_features": meta["runtime_feature_count"],
        "named_streets": meta["street_count_named"],
        "wegenregister": official,
    }, indent=2))

if __name__ == "__main__":
    main()
