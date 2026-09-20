#!/usr/bin/env python3
import json, urllib.parse, urllib.request
from pathlib import Path

ROOT=Path("dender-county-3d/geodata")
UA="DenderCounty-InfrabelCrossings/9.2 (+https://dender-county-3d.onrender.com/)"

def get_json(url,timeout=180):
    req=urllib.request.Request(url,headers={"User-Agent":UA,"Accept":"application/json, application/geo+json"})
    with urllib.request.urlopen(req,timeout=timeout) as r:return json.load(r)

def bounds():
    metas=[json.loads((ROOT/f"{k}_meta.json").read_text(encoding="utf-8")) for k in ("erpe_mere","lede","aalst")]
    return {
      "south":min(m["bbox_wgs84"]["south"] for m in metas),
      "north":max(m["bbox_wgs84"]["north"] for m in metas),
      "west":min(m["bbox_wgs84"]["west"] for m in metas),
      "east":max(m["bbox_wgs84"]["east"] for m in metas)
    }

def point_from_feature(ft):
    g=ft.get("geometry") or {}
    c=g.get("coordinates")
    if g.get("type")=="Point" and isinstance(c,list) and len(c)>=2:
        return float(c[0]),float(c[1])
    p=ft.get("properties") or {}
    for key in ("geo_point_2d","geopoint","coordonnees","coordinates"):
        v=p.get(key)
        if isinstance(v,dict) and "lon" in v and "lat" in v:return float(v["lon"]),float(v["lat"])
        if isinstance(v,list) and len(v)>=2:
            a,b=float(v[0]),float(v[1])
            if abs(a)<=90 and abs(b)<=180:return b,a
            return a,b
    return None

def load_official():
    urls=[
      "https://opendata.infrabel.be/api/explore/v2.1/catalog/datasets/geoow/exports/geojson?lang=nl&timezone=Europe%2FBrussels",
      "https://opendata.infrabel.be/explore/dataset/geoow/download/?format=geojson&timezone=Europe%2FBrussels&lang=nl"
    ]
    last=None
    for url in urls:
        try:
            data=get_json(url,240)
            if data.get("type")=="FeatureCollection" and data.get("features") is not None:return data,url
        except Exception as e:last=e
    raise RuntimeError(f"Infrabel geoow unavailable: {last}")

def main():
    b=bounds();raw,url=load_official();features=[]
    for i,ft in enumerate(raw.get("features",[])):
        pt=point_from_feature(ft)
        if not pt:continue
        lon,lat=pt
        if not (b["west"]<=lon<=b["east"] and b["south"]<=lat<=b["north"]):continue
        p=dict(ft.get("properties") or {})
        source_id=None
        for key in ("id","objectid","object_id","nummer","numero","number","overweg","pn"):
            if p.get(key) not in (None,""):
                source_id=f"infrabel/{p[key]}";break
        if source_id is None:source_id=f"infrabel/geoow/{i}"
        p.update({
          "source":"Infrabel Open Data",
          "source_dataset":"geoow",
          "source_id":source_id,
          "kind":"level_crossing"
        })
        features.append({"type":"Feature","id":source_id,"properties":p,"geometry":{"type":"Point","coordinates":[lon,lat]}})
    fc={"type":"FeatureCollection","name":"Dender County official railway crossings","bbox":[b["west"],b["south"],b["east"],b["north"]],"features":features}
    (ROOT/"level_crossings.geojson").write_text(json.dumps(fc,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    meta={
      "source":"Infrabel Open Data","dataset":"geoow",
      "dataset_url":"https://opendata.infrabel.be/explore/dataset/geoow/",
      "api_url":url,"attribution":"Infrabel",
      "feature_count":len(features),"bbox_wgs84":b
    }
    (ROOT/"level_crossings_meta.json").write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(meta,ensure_ascii=False,indent=2))

if __name__=="__main__":main()
