#!/usr/bin/env python3
import json, sys, urllib.parse, urllib.request
from pathlib import Path

OUT=Path("dender-county-3d/geodata"); OUT.mkdir(parents=True,exist_ok=True)
UA="DenderCounty-RegionalImporter/3.0 (+https://dender-county-3d.onrender.com/)"
CONFIG={
    "lede":{"query":"Lede, Belgium","label":"Lede"},
    "aalst":{"query":"Aalst, Belgium","label":"Aalst"},
}

def get_json(url,data=None,timeout=150):
    req=urllib.request.Request(url,data=data,headers={
        "User-Agent":UA,"Accept":"application/json, application/geo+json;q=0.9, */*;q=0.1",
        "Content-Type":"application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req,timeout=timeout) as r:return json.load(r)

def nominatim(query):
    qs=urllib.parse.urlencode({"q":query,"format":"jsonv2","limit":1,"polygon_geojson":1})
    arr=get_json("https://nominatim.openstreetmap.org/search?"+qs,timeout=60)
    if not arr:raise RuntimeError("Boundary not found: "+query)
    return arr[0]

def rings(g):
    if not g:return[]
    if g["type"]=="Polygon":return[g["coordinates"][0]]
    if g["type"]=="MultiPolygon":return[p[0] for p in g["coordinates"] if p]
    return[]

def inside(lon,lat,g):
    for ring in rings(g):
        hit=False
        for i in range(len(ring)):
            j=i-1;xi,yi=ring[i][:2];xj,yj=ring[j][:2]
            if ((yi>lat)!=(yj>lat)) and lon<(xj-xi)*(lat-yi)/(yj-yi+1e-15)+xi:hit=not hit
        if hit:return True
    return False

def midpoint(g):
    if not g:return None
    c=g.get("coordinates")
    if g["type"]=="LineString" and c:
        p=c[len(c)//2];return p[0],p[1]
    if g["type"]=="MultiLineString" and c:
        line=c[len(c)//2]
        if line:
            p=line[len(line)//2];return p[0],p[1]
    if g["type"]=="Point":return c[0],c[1]
    return None

def official_roads(b,boundary):
    base="https://geo.api.vlaanderen.be/Wegenregister/ogc/features/v1"
    cid="Wegsegment"
    params={
        "bbox":f'{b["west"]},{b["south"]},{b["east"]},{b["north"]}',
        "limit":10000,"f":"json"
    }
    url=f"{base}/collections/{cid}/items?"+urllib.parse.urlencode(params)
    raw=[];page_no=0;seen=set()
    while url and url not in seen and page_no<100:
        seen.add(url);page_no+=1
        page=get_json(url,timeout=150);raw.extend(page.get("features",[]))
        nxt=None
        for link in page.get("links",[]):
            if link.get("rel")=="next" and link.get("href"):nxt=link["href"];break
        url=nxt
    out=[]
    for ft in raw:
        mid=midpoint(ft.get("geometry"))
        if not mid or not inside(mid[0],mid[1],boundary):continue
        p=ft.get("properties",{})
        left=(p.get("linkerstraatnaam") or "").strip()
        right=(p.get("rechterstraatnaam") or "").strip()
        out.append({
            "type":"Feature","id":f'wegenregister/{p.get("objectId")}',
            "properties":{
                "source":"Digitaal Vlaanderen Wegenregister",
                "source_id":f'wegenregister/{p.get("objectId")}',
                "kind":"road","name":left or right or None,
                "left_name":left or None,"right_name":right or None,
                "status":p.get("wegsegmentstatus"),
                "road_class":p.get("morfologischeWegklasse"),
                "road_category":p.get("wegcategorie"),
                "access":p.get("toegangsbeperking"),
                "begin_node":p.get("beginknoopObjectId"),
                "end_node":p.get("eindknoopObjectId"),
                "manager":p.get("labelWegbeheerder")
            },
            "geometry":ft.get("geometry")
        })
    return out,{"endpoint":base,"collection_id":cid,"bbox_feature_count":len(raw),"municipality_feature_count":len(out),"pages":page_no}

def overpass(b):
    bbox=f'{b["south"]},{b["west"]},{b["north"]},{b["east"]}'
    q=f"""[out:json][timeout:90];
(
 way["railway"]({bbox});
 node["railway"="station"]({bbox});
 node["place"~"city|town|village|hamlet"]({bbox});
);
out tags geom;"""
    data=urllib.parse.urlencode({"data":q}).encode();last=None
    for ep in ["https://overpass.kumi.systems/api/interpreter","https://overpass-api.de/api/interpreter"]:
        try:return get_json(ep,data=data,timeout=130)
        except Exception as e:last=e
    raise RuntimeError(last)

def supplements(raw,boundary):
    out=[]
    for e in raw.get("elements",[]):
        tags=e.get("tags",{})
        if e.get("type")=="way" and e.get("geometry"):
            geom={"type":"LineString","coordinates":[[p["lon"],p["lat"]] for p in e["geometry"]]}
            mid=midpoint(geom)
            if mid and inside(mid[0],mid[1],boundary):
                out.append({"type":"Feature","id":f'way/{e["id"]}',"properties":{
                    "source":"OpenStreetMap","source_id":f'way/{e["id"]}',"kind":"railway",
                    "name":tags.get("name"),"railway":tags.get("railway")
                },"geometry":geom})
        elif e.get("type")=="node" and "lat" in e and "lon" in e and inside(e["lon"],e["lat"],boundary):
            if tags.get("railway")=="station" or tags.get("place"):
                out.append({"type":"Feature","id":f'node/{e["id"]}',"properties":{
                    "source":"OpenStreetMap","source_id":f'node/{e["id"]}',
                    "kind":"station" if tags.get("railway")=="station" else "place",
                    "name":tags.get("name"),"railway":tags.get("railway"),"place":tags.get("place")
                },"geometry":{"type":"Point","coordinates":[e["lon"],e["lat"]]}})
    return out

def main():
    key=sys.argv[1].lower()
    cfg=CONFIG[key];n=nominatim(cfg["query"]);bb=[float(x) for x in n["boundingbox"]]
    b={"south":bb[0],"north":bb[1],"west":bb[2],"east":bb[3]};boundary=n["geojson"]
    roads,official=official_roads(b,boundary);supp=supplements(overpass(b),boundary)
    runtime={"type":"FeatureCollection","name":cfg["label"]+" runtime geography",
             "bbox":[b["west"],b["south"],b["east"],b["north"]],"features":roads+supp}
    (OUT/f"{key}_runtime.geojson").write_text(json.dumps(runtime,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    boundary_fc={"type":"FeatureCollection","features":[{
        "type":"Feature","properties":{"source":"OpenStreetMap/Nominatim","display_name":n.get("display_name"),
        "osm_type":n.get("osm_type"),"osm_id":n.get("osm_id"),"municipality":cfg["label"]},"geometry":boundary}]}
    (OUT/f"{key}_boundaries.geojson").write_text(json.dumps(boundary_fc,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    streets=sorted({f["properties"]["name"] for f in roads if f["properties"].get("name")})
    places=sorted({f["properties"].get("name") for f in supp if f["properties"].get("kind")=="place" and f["properties"].get("name")})
    stations=sorted({f["properties"].get("name") for f in supp if f["properties"].get("kind")=="station" and f["properties"].get("name")})
    meta={"sector":cfg["label"],"municipality":cfg["label"],"country":"Belgium",
          "center_wgs84":{"lat":(b["south"]+b["north"])/2,"lon":(b["west"]+b["east"])/2},
          "bbox_wgs84":b,"world_scale":"1 real metre = 1 game metre",
          "runtime_geometry_source":"Digitaal Vlaanderen Wegenregister + OpenStreetMap supplements",
          "wegenregister":official,"osm_attribution":"© OpenStreetMap contributors, ODbL",
          "named_street_count":len(streets),"street_names":streets,"places":places,
          "stations":stations,"runtime_feature_count":len(runtime["features"])}
    (OUT/f"{key}_meta.json").write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps({"key":key,"roads":len(roads),"streets":len(streets),"places":places,"stations":stations},ensure_ascii=False,indent=2))

if __name__=="__main__":main()
