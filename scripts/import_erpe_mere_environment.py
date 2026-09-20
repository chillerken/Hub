#!/usr/bin/env python3
import json, math, re, urllib.parse, urllib.request
from pathlib import Path

OUT=Path("dender-county-3d/geodata"); OUT.mkdir(parents=True,exist_ok=True)
UA="DenderCounty-EnvironmentImporter/1.1 (+https://dender-county-3d.onrender.com/)"

def get_json(url,data=None,timeout=180):
    req=urllib.request.Request(url,data=data,headers={
        "User-Agent":UA,"Accept":"application/json",
        "Content-Type":"application/x-www-form-urlencoded"
    })
    with urllib.request.urlopen(req,timeout=timeout) as r:return json.load(r)

def nominatim():
    qs=urllib.parse.urlencode({"q":"Erpe-Mere, Belgium","format":"jsonv2","limit":1,"polygon_geojson":1})
    arr=get_json("https://nominatim.openstreetmap.org/search?"+qs,timeout=60)
    if not arr:raise RuntimeError("Erpe-Mere boundary not found")
    return arr[0]

def rings(g):
    if not g:return[]
    if g["type"]=="Polygon":return[g["coordinates"][0]]
    if g["type"]=="MultiPolygon":return[p[0] for p in g["coordinates"]]
    return[]

def inside(lon,lat,g):
    for ring in rings(g):
        hit=False
        for i in range(len(ring)):
            j=i-1;xi,yi=ring[i];xj,yj=ring[j]
            if ((yi>lat)!=(yj>lat)) and lon<(xj-xi)*(lat-yi)/(yj-yi+1e-15)+xi:hit=not hit
        if hit:return True
    return False

def midpoint_geom(g):
    if not g:return None
    c=g.get("coordinates")
    if g["type"]=="LineString" and c:
        p=c[len(c)//2];return p[0],p[1]
    if g["type"]=="Polygon" and c and c[0]:
        ring=c[0];sx=sum(p[0] for p in ring);sy=sum(p[1] for p in ring);return sx/len(ring),sy/len(ring)
    return None

def height(tags,obj_id):
    raw=tags.get("height")
    if raw:
        m=re.search(r"([0-9]+(?:\.[0-9]+)?)",str(raw))
        if m:return max(2.5,min(45,float(m.group(1))))
    lev=tags.get("building:levels")
    if lev:
        try:return max(2.8,min(45,float(lev)*3.0))
        except:pass
    return 4.8+(int(obj_id)%5)*0.75

def query_tile(b, depth=0):
    bbox=f'{b["south"]},{b["west"]},{b["north"]},{b["east"]}'
    q=f"""[out:json][timeout:75];
(
  way["building"]({bbox});
  way["waterway"]({bbox});
  way["natural"="water"]({bbox});
  way["landuse"="reservoir"]({bbox});
  way["natural"="wood"]({bbox});
  way["landuse"="forest"]({bbox});
  way["landuse"="orchard"]({bbox});
);
out tags geom;"""
    data=urllib.parse.urlencode({"data":q}).encode()
    last=None
    for ep in ["https://overpass.kumi.systems/api/interpreter","https://overpass.private.coffee/api/interpreter","https://overpass-api.de/api/interpreter"]:
        for attempt in range(1):
            try:return get_json(ep,data=data,timeout=55)
            except Exception as e:last=e
    if depth>=3:
        print("SKIP tile after recursive retries",b,"error",repr(last),flush=True)
        return {"elements":[]}
    midlat=(b["south"]+b["north"])/2
    midlon=(b["west"]+b["east"])/2
    merged={}
    for sub in [
        {"south":b["south"],"north":midlat,"west":b["west"],"east":midlon},
        {"south":b["south"],"north":midlat,"west":midlon,"east":b["east"]},
        {"south":midlat,"north":b["north"],"west":b["west"],"east":midlon},
        {"south":midlat,"north":b["north"],"west":midlon,"east":b["east"]},
    ]:
        part=query_tile(sub,depth+1)
        for e in part.get("elements",[]):merged[(e.get("type"),e.get("id"))]=e
    return {"elements":list(merged.values())}

def query(b):
    rows, cols = 8, 8
    merged={}
    lat_step=(b["north"]-b["south"])/rows
    lon_step=(b["east"]-b["west"])/cols
    for iy in range(rows):
        for ix in range(cols):
            tile={
                "south":b["south"]+iy*lat_step,
                "north":b["south"]+(iy+1)*lat_step,
                "west":b["west"]+ix*lon_step,
                "east":b["west"]+(ix+1)*lon_step,
            }
            part=query_tile(tile)
            for e in part.get("elements",[]):
                merged[(e.get("type"),e.get("id"))]=e
            print("tile",iy,ix,"elements",len(part.get("elements",[])),"unique",len(merged),flush=True)
    return {"elements":list(merged.values())}

def main():
    n=nominatim();boundary=n["geojson"];bb=[float(x) for x in n["boundingbox"]]
    b={"south":bb[0],"north":bb[1],"west":bb[2],"east":bb[3]}
    raw=query(b);features=[];counts={}
    for e in raw.get("elements",[]):
        if e.get("type")!="way" or not e.get("geometry"):continue
        tags=e.get("tags",{});coords=[[p["lon"],p["lat"]] for p in e["geometry"]]
        closed=len(coords)>3 and coords[0]==coords[-1]
        if "building" in tags and closed:
            kind="building";geom={"type":"Polygon","coordinates":[coords]}
            props={"source":"OpenStreetMap","source_id":f'way/{e["id"]}',"kind":kind,
                   "building":tags.get("building"),"name":tags.get("name"),"height_m":height(tags,e["id"]),
                   "levels":tags.get("building:levels"),"amenity":tags.get("amenity")}
        elif tags.get("natural")=="water" or tags.get("landuse")=="reservoir":
            if not closed:continue
            kind="water";geom={"type":"Polygon","coordinates":[coords]}
            props={"source":"OpenStreetMap","source_id":f'way/{e["id"]}',"kind":kind,"name":tags.get("name")}
        elif "waterway" in tags:
            kind="waterway";geom={"type":"LineString","coordinates":coords}
            props={"source":"OpenStreetMap","source_id":f'way/{e["id"]}',"kind":kind,
                   "waterway":tags.get("waterway"),"name":tags.get("name")}
        elif tags.get("natural")=="wood" or tags.get("landuse") in ("forest","orchard"):
            if not closed:continue
            kind="vegetation";geom={"type":"Polygon","coordinates":[coords]}
            props={"source":"OpenStreetMap","source_id":f'way/{e["id"]}',"kind":kind,
                   "landuse":tags.get("landuse"),"natural":tags.get("natural"),"name":tags.get("name")}
        else:continue
        mid=midpoint_geom(geom)
        if not mid or not inside(mid[0],mid[1],boundary):continue
        counts[kind]=counts.get(kind,0)+1
        features.append({"type":"Feature","id":props["source_id"],"properties":props,"geometry":geom})
    fc={"type":"FeatureCollection","name":"Erpe-Mere environment","bbox":[b["west"],b["south"],b["east"],b["north"]],"features":features}
    (OUT/"erpe_mere_environment.geojson").write_text(json.dumps(fc,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    meta={"source":"OpenStreetMap","license":"ODbL","attribution":"© OpenStreetMap contributors",
          "bbox_wgs84":b,"counts":counts,"feature_count":len(features),
          "generated_by":"scripts/import_erpe_mere_environment.py"}
    (OUT/"erpe_mere_environment_meta.json").write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(meta,ensure_ascii=False,indent=2))

if __name__=="__main__":main()
