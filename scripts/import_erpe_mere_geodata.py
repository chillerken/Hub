#!/usr/bin/env python3
import json, urllib.parse, urllib.request
from pathlib import Path

OUT=Path("dender-county-3d/geodata"); OUT.mkdir(parents=True,exist_ok=True)
UA="DenderCounty-GeodataImporter/1.0 (+https://dender-county-3d.onrender.com/)"

def get_json(url,data=None,timeout=120):
    req=urllib.request.Request(url,data=data,headers={
        "User-Agent":UA,
        "Accept":"application/json, application/geo+json;q=0.9, */*;q=0.1",
        "Content-Type":"application/x-www-form-urlencoded",
    })
    with urllib.request.urlopen(req,timeout=timeout) as r:return json.load(r)

def nominatim(query):
    qs=urllib.parse.urlencode({"q":query,"format":"jsonv2","limit":1,"polygon_geojson":1})
    arr=get_json("https://nominatim.openstreetmap.org/search?"+qs,timeout=60)
    if not arr: raise RuntimeError("Boundary not found: "+query)
    return arr[0]

def rings(geom):
    if not geom:return []
    if geom["type"]=="Polygon":return [geom["coordinates"][0]]
    if geom["type"]=="MultiPolygon":return [p[0] for p in geom["coordinates"]]
    return []

def inside(lon,lat,geom):
    for ring in rings(geom):
        hit=False
        for i in range(len(ring)):
            j=i-1
            xi,yi=ring[i][0],ring[i][1]; xj,yj=ring[j][0],ring[j][1]
            if ((yi>lat)!=(yj>lat)) and lon < (xj-xi)*(lat-yi)/(yj-yi+1e-15)+xi: hit=not hit
        if hit:return True
    return False

def midpoint(geom):
    if not geom:return None
    coords=geom.get("coordinates")
    if geom["type"]=="LineString" and coords:
        p=coords[len(coords)//2]; return p[0],p[1]
    if geom["type"]=="MultiLineString" and coords and coords[0]:
        line=coords[len(coords)//2]; p=line[len(line)//2]; return p[0],p[1]
    if geom["type"]=="Point":return coords[0],coords[1]
    return None

def overpass(b):
    bbox=f'{b["south"]},{b["west"]},{b["north"]},{b["east"]}'
    q=f"""[out:json][timeout:100];
(
 way["railway"]({bbox});
 node["railway"="station"]({bbox});
 node["place"~"village|hamlet|town"]({bbox});
);
out tags geom;"""
    data=urllib.parse.urlencode({"data":q}).encode()
    last=None
    for ep in ["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter"]:
        try:return get_json(ep,data=data,timeout=150)
        except Exception as e:last=e
    raise RuntimeError(last)

def official_roads(b,boundary):
    base="https://geo.api.vlaanderen.be/Wegenregister/ogc/features/v1"
    collections=get_json(base+"/collections?f=json",timeout=45)
    cid=next(c["id"] for c in collections["collections"] if "wegsegment" in (str(c.get("id",""))+" "+str(c.get("title",""))).lower())
    params=urllib.parse.urlencode({
        "bbox":f'{b["west"]},{b["south"]},{b["east"]},{b["north"]}',
        "limit":10000,"f":"json"
    })
    fc=get_json(f"{base}/collections/{urllib.parse.quote(str(cid))}/items?{params}",timeout=150)
    out=[]
    for ft in fc.get("features",[]):
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
                "manager":p.get("labelWegbeheerder"),
            },
            "geometry":ft.get("geometry"),
        })
    return out,base,cid,len(fc.get("features",[]))

def osm_supplements(raw,boundary):
    out=[]
    for e in raw.get("elements",[]):
        tags=e.get("tags",{})
        if e["type"]=="way" and e.get("geometry"):
            coords=[[p["lon"],p["lat"]] for p in e["geometry"]]
            geom={"type":"LineString","coordinates":coords}
            mid=midpoint(geom)
            if not mid or not inside(mid[0],mid[1],boundary):continue
            out.append({"type":"Feature","id":f'way/{e["id"]}',"properties":{
                "source":"OpenStreetMap","source_id":f'way/{e["id"]}',
                "kind":"railway","name":tags.get("name"),"railway":tags.get("railway")
            },"geometry":geom})
        elif e["type"]=="node" and "lat" in e and "lon" in e:
            if not inside(e["lon"],e["lat"],boundary):continue
            if tags.get("railway")=="station" or tags.get("place"):
                out.append({"type":"Feature","id":f'node/{e["id"]}',"properties":{
                    "source":"OpenStreetMap","source_id":f'node/{e["id"]}',
                    "kind":"station" if tags.get("railway")=="station" else "place",
                    "name":tags.get("name"),"railway":tags.get("railway"),"place":tags.get("place")
                },"geometry":{"type":"Point","coordinates":[e["lon"],e["lat"]]}})
    return out

def main():
    n=nominatim("Erpe-Mere, Belgium")
    bb=[float(x) for x in n["boundingbox"]]
    b={"south":bb[0],"north":bb[1],"west":bb[2],"east":bb[3]}
    boundary=n["geojson"]
    roads,endpoint,cid,bbox_count=official_roads(b,boundary)
    raw=overpass(b)
    supp=osm_supplements(raw,boundary)
    runtime={"type":"FeatureCollection","name":"Erpe-Mere runtime geography",
             "bbox":[b["west"],b["south"],b["east"],b["north"]],
             "features":roads+supp}
    (OUT/"erpe_mere_runtime.geojson").write_text(json.dumps(runtime,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    boundaries={"type":"FeatureCollection","features":[{
        "type":"Feature","properties":{"source":"OpenStreetMap/Nominatim","display_name":n.get("display_name"),
        "osm_type":n.get("osm_type"),"osm_id":n.get("osm_id")},"geometry":boundary
    }]}
    (OUT/"erpe_mere_boundaries.geojson").write_text(json.dumps(boundaries,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    streets=sorted({f["properties"]["name"] for f in roads if f["properties"].get("name")})
    places=sorted({f["properties"].get("name") for f in supp if f["properties"].get("kind")=="place" and f["properties"].get("name")})
    stations=sorted({f["properties"].get("name") for f in supp if f["properties"].get("kind")=="station" and f["properties"].get("name")})
    center={"lat":(b["south"]+b["north"])/2,"lon":(b["west"]+b["east"])/2}
    meta={
        "sector":"Erpe-Mere","municipality":"Erpe-Mere","country":"Belgium",
        "center_wgs84":center,"bbox_wgs84":b,"world_scale":"1 real metre = 1 game metre",
        "runtime_geometry_source":"Digitaal Vlaanderen Wegenregister (roads) + OpenStreetMap (rail/station/place supplements)",
        "official_validation_source":"Digitaal Vlaanderen Wegenregister OGC API Features",
        "wegenregister":{"endpoint":endpoint,"collection_id":cid,"bbox_feature_count":bbox_count,"municipality_feature_count":len(roads)},
        "osm_attribution":"© OpenStreetMap contributors, ODbL",
        "named_street_count":len(streets),"street_names":streets,
        "places":places,"stations":stations,"runtime_feature_count":len(runtime["features"]),
        "generated_by":"scripts/import_erpe_mere_geodata.py"
    }
    (OUT/"erpe_mere_meta.json").write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps({"roads":len(roads),"named_streets":len(streets),"places":places,"stations":stations,"runtime":len(runtime["features"])},ensure_ascii=False,indent=2))

if __name__=="__main__":main()
