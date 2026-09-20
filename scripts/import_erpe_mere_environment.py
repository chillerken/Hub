#!/usr/bin/env python3
import json, math, urllib.parse, urllib.request
from pathlib import Path

OUT=Path("dender-county-3d/geodata"); OUT.mkdir(parents=True,exist_ok=True)
UA="DenderCounty-EnvironmentImporter/2.0 (+https://dender-county-3d.onrender.com/)"
CRS84="http://www.opengis.net/def/crs/OGC/1.3/CRS84"

def get_json(url,data=None,timeout=150,content_type="application/x-www-form-urlencoded"):
    req=urllib.request.Request(url,data=data,headers={
        "User-Agent":UA,"Accept":"application/json",
        "Content-Type":content_type
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
    if g["type"]=="MultiPolygon":return[p[0] for p in g["coordinates"] if p]
    return[]

def inside(lon,lat,g):
    for ring in rings(g):
        hit=False
        for i in range(len(ring)):
            j=i-1;xi,yi=ring[i];xj,yj=ring[j]
            if ((yi>lat)!=(yj>lat)) and lon<(xj-xi)*(lat-yi)/(yj-yi+1e-15)+xi:hit=not hit
        if hit:return True
    return False

def centroid_ring(ring):
    if not ring:return None
    pts=ring[:-1] if len(ring)>1 and ring[0]==ring[-1] else ring
    if not pts:return None
    return sum(p[0] for p in pts)/len(pts),sum(p[1] for p in pts)/len(pts)

def plausible_wgs84(g):
    rs=rings(g)
    if not rs or not rs[0]:return False
    x,y=rs[0][0][:2]
    return -180<=x<=180 and -90<=y<=90

def building_height(fid):
    try:n=int(str(fid).split("/")[-1].split(".")[-1])
    except:n=sum(ord(c) for c in str(fid))
    return round(5.1+(n%6)*0.75,2)

def official_buildings(b,boundary):
    base="https://geo.api.vlaanderen.be/Gebouwenregister/ogc/features/v1"
    collections=get_json(base+"/collections?f=json",timeout=60)
    cid=None
    for c in collections.get("collections",[]):
        hay=(str(c.get("id",""))+" "+str(c.get("title",""))).lower()
        if hay.strip()=="gebouw" or " gebouw" in " "+hay:
            cid=c.get("id");break
    if not cid:cid="Gebouw"
    features=[];offset=0;limit=1000;matched=None
    while True:
        params={
            "bbox":f'{b["west"]},{b["south"]},{b["east"]},{b["north"]}',
            "bbox-crs":CRS84,"crs":CRS84,"limit":limit,"offset":offset,"f":"json"
        }
        url=f"{base}/collections/{urllib.parse.quote(str(cid))}/items?"+urllib.parse.urlencode(params)
        page=get_json(url,timeout=150)
        items=page.get("features",[])
        if matched is None:matched=page.get("numberMatched")
        if items and not plausible_wgs84(items[0].get("geometry")):
            raise RuntimeError("Gebouwenregister did not return CRS84 coordinates")
        for ft in items:
            g=ft.get("geometry");p=ft.get("properties",{});fid=ft.get("id") or p.get("objectId") or f"building-{offset}"
            if not g:continue
            polys=[]
            if g["type"]=="Polygon":polys=[g["coordinates"]]
            elif g["type"]=="MultiPolygon":polys=g["coordinates"]
            else:continue
            for k,poly in enumerate(polys):
                if not poly or not poly[0]:continue
                mid=centroid_ring(poly[0])
                if not mid or not inside(mid[0],mid[1],boundary):continue
                features.append({
                    "type":"Feature","id":f"gebouw/{fid}/{k}",
                    "properties":{
                        "source":"Digitaal Vlaanderen Gebouwenregister",
                        "source_id":f"gebouw/{fid}/{k}",
                        "kind":"building",
                        "building":"official",
                        "height_m":building_height(fid),
                        "status":p.get("gebouwstatus") or p.get("status"),
                    },
                    "geometry":{"type":"Polygon","coordinates":poly}
                })
        offset+=len(items)
        print("official buildings page",offset,"matched",matched,flush=True)
        if not items or len(items)<limit or (isinstance(matched,int) and offset>=matched):break
        if offset>50000:break
    return features,{"endpoint":base,"collection_id":cid,"numberMatched":matched,"municipality_count":len(features)}

def osm_nature_tile(b,depth=0):
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
        try:return get_json(ep,data=data,timeout=70)
        except Exception as e:last=e
    if depth>=2:
        print("SKIP nature tile",b,repr(last),flush=True);return {"elements":[]}
    midlat=(b["south"]+b["north"])/2;midlon=(b["west"]+b["east"])/2;merged={}
    for sub in [
        {"south":b["south"],"north":midlat,"west":b["west"],"east":midlon},
        {"south":b["south"],"north":midlat,"west":midlon,"east":b["east"]},
        {"south":midlat,"north":b["north"],"west":b["west"],"east":midlon},
        {"south":midlat,"north":b["north"],"west":midlon,"east":b["east"]},
    ]:
        part=osm_nature_tile(sub,depth+1)
        for e in part.get("elements",[]):merged[(e.get("type"),e.get("id"))]=e
    return {"elements":list(merged.values())}

def osm_nature(b,boundary):
    raw=osm_nature_tile(b);out=[];counts={}
    for e in raw.get("elements",[]):
        if e.get("type")!="way" or not e.get("geometry"):continue
        tags=e.get("tags",{});coords=[[p["lon"],p["lat"]] for p in e["geometry"]]
        closed=len(coords)>3 and coords[0]==coords[-1]
        if tags.get("natural")=="water" or tags.get("landuse")=="reservoir":
            if not closed:continue
            kind="water";geom={"type":"Polygon","coordinates":[coords]}
            props={"source":"OpenStreetMap","source_id":f'way/{e["id"]}',"kind":kind,"name":tags.get("name")}
        elif "waterway" in tags:
            kind="waterway";geom={"type":"LineString","coordinates":coords}
            props={"source":"OpenStreetMap","source_id":f'way/{e["id"]}',"kind":kind,"waterway":tags.get("waterway"),"name":tags.get("name")}
        elif tags.get("natural")=="wood" or tags.get("landuse") in ("forest","orchard"):
            if not closed:continue
            kind="vegetation";geom={"type":"Polygon","coordinates":[coords]}
            props={"source":"OpenStreetMap","source_id":f'way/{e["id"]}',"kind":kind,"landuse":tags.get("landuse"),"natural":tags.get("natural"),"name":tags.get("name")}
        else:continue
        if geom["type"]=="Polygon":mid=centroid_ring(geom["coordinates"][0])
        else:
            p=geom["coordinates"][len(geom["coordinates"])//2];mid=(p[0],p[1])
        if not mid or not inside(mid[0],mid[1],boundary):continue
        out.append({"type":"Feature","id":props["source_id"],"properties":props,"geometry":geom})
        counts[kind]=counts.get(kind,0)+1
    return out,counts

def main():
    n=nominatim();boundary=n["geojson"];bb=[float(x) for x in n["boundingbox"]]
    b={"south":bb[0],"north":bb[1],"west":bb[2],"east":bb[3]}
    buildings,official_meta=official_buildings(b,boundary)
    nature,nature_counts=osm_nature(b,boundary)
    features=buildings+nature
    counts={"building":len(buildings),**nature_counts}
    fc={"type":"FeatureCollection","name":"Erpe-Mere environment","bbox":[b["west"],b["south"],b["east"],b["north"]],"features":features}
    (OUT/"erpe_mere_environment.geojson").write_text(json.dumps(fc,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    meta={
        "primary_building_source":"Digitaal Vlaanderen Gebouwenregister",
        "supplement_source":"OpenStreetMap",
        "building_source_access":"public OGC API Features",
        "osm_license":"ODbL","osm_attribution":"© OpenStreetMap contributors",
        "official_attribution":"© Digitaal Vlaanderen",
        "official":official_meta,
        "bbox_wgs84":b,"counts":counts,"feature_count":len(features),
        "generated_by":"scripts/import_erpe_mere_environment.py"
    }
    (OUT/"erpe_mere_environment_meta.json").write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(meta,ensure_ascii=False,indent=2))

if __name__=="__main__":main()
