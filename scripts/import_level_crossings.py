#!/usr/bin/env python3
import json, urllib.parse, urllib.request
from pathlib import Path

ROOT=Path("dender-county-3d/geodata")
UA="DenderCounty-LevelCrossings/9.2 (+https://dender-county-3d.onrender.com/)"

def get_json(url,data=None,timeout=120):
    req=urllib.request.Request(url,data=data,headers={
        "User-Agent":UA,"Accept":"application/json","Content-Type":"application/x-www-form-urlencoded"
    })
    with urllib.request.urlopen(req,timeout=timeout) as r:return json.load(r)

def main():
    metas=[json.loads((ROOT/f"{k}_meta.json").read_text(encoding="utf-8")) for k in ("erpe_mere","lede","aalst")]
    south=min(m["bbox_wgs84"]["south"] for m in metas)
    north=max(m["bbox_wgs84"]["north"] for m in metas)
    west=min(m["bbox_wgs84"]["west"] for m in metas)
    east=max(m["bbox_wgs84"]["east"] for m in metas)
    bbox=f"{south},{west},{north},{east}"
    q=f'''[out:json][timeout:80];
(
  node["railway"="level_crossing"]({bbox});
  node["railway"="crossing"]({bbox});
);
out tags;'''
    payload=urllib.parse.urlencode({"data":q}).encode()
    last=None
    raw=None
    for ep in ("https://overpass.kumi.systems/api/interpreter","https://overpass-api.de/api/interpreter"):
        try:
            raw=get_json(ep,payload,120);break
        except Exception as e:last=e
    if raw is None:raise RuntimeError(last)
    features=[]
    seen=set()
    for e in raw.get("elements",[]):
        if e.get("type")!="node" or "lat" not in e or "lon" not in e:continue
        if e["id"] in seen:continue
        seen.add(e["id"]);t=e.get("tags",{})
        features.append({
            "type":"Feature","id":f'node/{e["id"]}',
            "properties":{
                "source":"OpenStreetMap","source_id":f'node/{e["id"]}',
                "kind":"level_crossing",
                "railway":t.get("railway"),
                "crossing":t.get("crossing"),
                "barrier":t.get("barrier"),
                "name":t.get("name"),
                "ref":t.get("ref")
            },
            "geometry":{"type":"Point","coordinates":[e["lon"],e["lat"]]}
        })
    fc={"type":"FeatureCollection","name":"Dender County real railway crossings","bbox":[west,south,east,north],"features":features}
    (ROOT/"level_crossings.geojson").write_text(json.dumps(fc,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    meta={"source":"OpenStreetMap","license":"ODbL","attribution":"© OpenStreetMap contributors","feature_count":len(features),"bbox_wgs84":{"south":south,"west":west,"north":north,"east":east}}
    (ROOT/"level_crossings_meta.json").write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(meta,indent=2))

if __name__=="__main__":main()
