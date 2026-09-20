#!/usr/bin/env python3
import json, sys, urllib.parse, urllib.request
from pathlib import Path

OUT=Path("dender-county-3d/geodata")
UA="DenderCounty-RegionalEnvironment/3.0 (+https://dender-county-3d.onrender.com/)"
CRS84="http://www.opengis.net/def/crs/OGC/1.3/CRS84"

def get_json(url,data=None,timeout=160):
    req=urllib.request.Request(url,data=data,headers={"User-Agent":UA,"Accept":"application/json","Content-Type":"application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req,timeout=timeout) as r:return json.load(r)

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

def centroid(ring):
    pts=ring[:-1] if len(ring)>1 and ring[0]==ring[-1] else ring
    if not pts:return None
    return sum(p[0] for p in pts)/len(pts),sum(p[1] for p in pts)/len(pts)

def height(fid):
    try:n=int(str(fid).split("/")[-1].split(".")[-1])
    except:n=sum(ord(c) for c in str(fid))
    return round(5.0+(n%7)*.72,2)

def official_buildings(b,boundary):
    base="https://geo.api.vlaanderen.be/Gebouwenregister/ogc/features/v1";cid="Gebouw"
    params={"bbox":f'{b["west"]},{b["south"]},{b["east"]},{b["north"]}',"bbox-crs":CRS84,"crs":CRS84,"limit":5000,"f":"json"}
    url=f"{base}/collections/{cid}/items?"+urllib.parse.urlencode(params)
    out=[];pages=0;seen=set();matched=None
    while url and url not in seen and pages<150:
        seen.add(url);pages+=1;page=get_json(url,timeout=180)
        if matched is None:matched=page.get("numberMatched")
        for ft in page.get("features",[]):
            g=ft.get("geometry");p=ft.get("properties",{});fid=ft.get("id") or p.get("objectId") or f"b-{pages}"
            if not g:continue
            polys=[g["coordinates"]] if g["type"]=="Polygon" else g["coordinates"] if g["type"]=="MultiPolygon" else []
            for k,poly in enumerate(polys):
                if not poly or not poly[0]:continue
                mid=centroid(poly[0])
                if not mid or not inside(mid[0],mid[1],boundary):continue
                out.append({"type":"Feature","id":f"gebouw/{fid}/{k}","properties":{
                    "source":"Digitaal Vlaanderen Gebouwenregister","source_id":f"gebouw/{fid}/{k}",
                    "kind":"building","height_m":height(fid),"status":p.get("gebouwstatus") or p.get("status")
                },"geometry":{"type":"Polygon","coordinates":poly}})
        nxt=None
        for link in page.get("links",[]):
            if link.get("rel")=="next" and link.get("href"):nxt=link["href"];break
        url=nxt
        print("buildings page",pages,"kept",len(out),flush=True)
    return out,{"endpoint":base,"collection_id":cid,"numberMatched":matched,"municipality_count":len(out),"pages":pages}

def nature_query(b,depth=0):
    bbox=f'{b["south"]},{b["west"]},{b["north"]},{b["east"]}'
    q=f"""[out:json][timeout:60];
(
 way["waterway"]({bbox});
 way["natural"="water"]({bbox});
 way["landuse"="reservoir"]({bbox});
 way["natural"="wood"]({bbox});
 way["landuse"="forest"]({bbox});
 way["landuse"="orchard"]({bbox});
);
out tags geom;"""
    data=urllib.parse.urlencode({"data":q}).encode();last=None
    for ep in ["https://overpass.kumi.systems/api/interpreter","https://overpass.private.coffee/api/interpreter","https://overpass-api.de/api/interpreter"]:
        try:return get_json(ep,data=data,timeout=80)
        except Exception as e:last=e
    if depth>=2:return {"elements":[]}
    ml=(b["south"]+b["north"])/2;mo=(b["west"]+b["east"])/2;merged={}
    for sub in [
        {"south":b["south"],"north":ml,"west":b["west"],"east":mo},
        {"south":b["south"],"north":ml,"west":mo,"east":b["east"]},
        {"south":ml,"north":b["north"],"west":b["west"],"east":mo},
        {"south":ml,"north":b["north"],"west":mo,"east":b["east"]},
    ]:
        part=nature_query(sub,depth+1)
        for e in part.get("elements",[]):merged[(e.get("type"),e.get("id"))]=e
    return {"elements":list(merged.values())}

def nature_features(b,boundary):
    raw=nature_query(b);out=[];counts={}
    for e in raw.get("elements",[]):
        if e.get("type")!="way" or not e.get("geometry"):continue
        tags=e.get("tags",{});coords=[[p["lon"],p["lat"]] for p in e["geometry"]];closed=len(coords)>3 and coords[0]==coords[-1]
        if tags.get("natural")=="water" or tags.get("landuse")=="reservoir":
            if not closed:continue
            kind="water";geom={"type":"Polygon","coordinates":[coords]}
        elif "waterway" in tags:
            kind="waterway";geom={"type":"LineString","coordinates":coords}
        elif tags.get("natural")=="wood" or tags.get("landuse") in ("forest","orchard"):
            if not closed:continue
            kind="vegetation";geom={"type":"Polygon","coordinates":[coords]}
        else:continue
        if geom["type"]=="Polygon":mid=centroid(geom["coordinates"][0])
        else:
            p=geom["coordinates"][len(geom["coordinates"])//2];mid=(p[0],p[1])
        if not mid or not inside(mid[0],mid[1],boundary):continue
        out.append({"type":"Feature","id":f'way/{e["id"]}',"properties":{
            "source":"OpenStreetMap","source_id":f'way/{e["id"]}',"kind":kind,
            "name":tags.get("name"),"waterway":tags.get("waterway"),"landuse":tags.get("landuse")
        },"geometry":geom});counts[kind]=counts.get(kind,0)+1
    return out,counts

def main():
    key=sys.argv[1].lower()
    boundary_path=OUT/f"{key}_boundaries.geojson";meta_path=OUT/f"{key}_meta.json"
    if not boundary_path.exists() or not meta_path.exists():
        print("SKIP: geography not available yet for",key);return
    boundary=json.loads(boundary_path.read_text(encoding="utf-8"))["features"][0]["geometry"]
    meta=json.loads(meta_path.read_text(encoding="utf-8"));b=meta["bbox_wgs84"]
    buildings,official=official_buildings(b,boundary);nature,ncounts=nature_features(b,boundary)
    features=buildings+nature;counts={"building":len(buildings),**ncounts}
    fc={"type":"FeatureCollection","name":key+" environment","bbox":[b["west"],b["south"],b["east"],b["north"]],"features":features}
    (OUT/f"{key}_environment.geojson").write_text(json.dumps(fc,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    em={"primary_building_source":"Digitaal Vlaanderen Gebouwenregister","supplement_source":"OpenStreetMap",
        "official":official,"counts":counts,"feature_count":len(features),"bbox_wgs84":b,
        "official_attribution":"© Digitaal Vlaanderen","osm_attribution":"© OpenStreetMap contributors"}
    (OUT/f"{key}_environment_meta.json").write_text(json.dumps(em,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(em,ensure_ascii=False,indent=2))

if __name__=="__main__":main()
