#!/usr/bin/env python3
import json, math, sys
from pathlib import Path

ROOT=Path("dender-county-3d/geodata")
BASE_META=json.loads((ROOT/"erpe_mere_meta.json").read_text(encoding="utf-8"))
ORIGIN_LAT=float(BASE_META["center_wgs84"]["lat"])
ORIGIN_LON=float(BASE_META["center_wgs84"]["lon"])
MLAT=111320.0
MLON=111320.0*math.cos(math.radians(ORIGIN_LAT))
CHUNK=750.0

def walk_coords(c,out):
    if isinstance(c,list) and len(c)>=2 and isinstance(c[0],(int,float)) and isinstance(c[1],(int,float)):
        out.append((float(c[0]),float(c[1])))
    elif isinstance(c,list):
        for x in c: walk_coords(x,out)

def center(ft):
    pts=[];g=ft.get("geometry") or {};walk_coords(g.get("coordinates"),pts)
    if not pts:return None
    lon=sum(p[0] for p in pts)/len(pts);lat=sum(p[1] for p in pts)/len(pts)
    x=(lon-ORIGIN_LON)*MLON;z=-(lat-ORIGIN_LAT)*MLAT
    return x,z

def main():
    key=sys.argv[1]
    src=ROOT/f"{key}_environment.geojson"
    if not src.exists():
        print("skip missing",src);return
    fc=json.loads(src.read_text(encoding="utf-8"))
    groups={}
    for ft in fc.get("features",[]):
        c=center(ft)
        if not c:continue
        cx=math.floor(c[0]/CHUNK);cz=math.floor(c[1]/CHUNK)
        groups.setdefault((cx,cz),[]).append(ft)
    outdir=ROOT/"chunks"/key
    outdir.mkdir(parents=True,exist_ok=True)
    manifest={"municipality":key,"chunk_size_m":CHUNK,"origin_wgs84":{"lat":ORIGIN_LAT,"lon":ORIGIN_LON},"chunks":[]}
    for (cx,cz),items in sorted(groups.items()):
        name=f"{cx}_{cz}.geojson"
        payload={"type":"FeatureCollection","features":items}
        (outdir/name).write_text(json.dumps(payload,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
        manifest["chunks"].append({"cx":cx,"cz":cz,"file":name,"features":len(items)})
    (outdir/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print(key,"chunks",len(groups),"features",sum(len(v) for v in groups.values()))

if __name__=="__main__":main()
