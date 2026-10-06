from pathlib import Path
from html.parser import HTMLParser
import urllib.request, urllib.parse, urllib.error
import xml.etree.ElementTree as ET
import re, shutil, json

LIVE="https://www.luxwash.online"
OUT=Path(__file__).resolve().parent/"dist"
if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir(parents=True, exist_ok=True)

UA={"User-Agent":"Mozilla/5.0","Cache-Control":"no-cache"}

def fetch(url):
    req=urllib.request.Request(url,headers=UA)
    with urllib.request.urlopen(req,timeout=30) as r:
        return r.read(), dict(r.headers), r.geturl()

def text_fetch(url):
    b,_,_=fetch(url)
    return b.decode("utf-8","ignore")

def strip_cf(s):
    s=re.sub(r'\s*<script>\(function\(\)\{function c\(\).*?</script>', '', s, flags=re.S)
    s=re.sub(r'\s*<iframe[^>]*visibility:\s*hidden[^>]*></iframe>', '', s, flags=re.S|re.I)
    return s

def patch_csp(s):
    m=re.search(r'(<meta\s+http-equiv=["\']Content-Security-Policy["\']\s+content=["\'])(.*?)(["\'][^>]*>)',s,re.I|re.S)
    if not m:
        return s
    c=m.group(2)
    script_host="https://reception-ai-rho.vercel.app"
    connect_hosts=[
        "https://reception-ai-rho.vercel.app",
        "https://ndecxbsrxspkuxjsbndq.supabase.co",
        "https://nahwlhptgdkwhjcfkhkt.supabase.co"
    ]
    if re.search(r'script-src\s',c,re.I) and script_host not in c:
        c=re.sub(r'(script-src\s+)([^;]*)',lambda mm:mm.group(1)+mm.group(2)+" "+script_host,c,count=1,flags=re.I)
    if re.search(r'connect-src\s',c,re.I):
        def add(mm):
            vals=mm.group(2)
            for h in connect_hosts:
                if h not in vals:
                    vals+=" "+h
            return mm.group(1)+vals
        c=re.sub(r'(connect-src\s+)([^;]*)',add,c,count=1,flags=re.I)
    return s[:m.start()]+m.group(1)+c+m.group(3)+s[m.end():]

class RefParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        for key in ("src","href"):
            v=a.get(key)
            if v:
                self.refs.append(v)

def save_bytes(path, data):
    dst=OUT/path.lstrip("/")
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(data)

def save_text(path, data):
    dst=OUT/path.lstrip("/")
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(data,encoding="utf-8")

def local_path_from_ref(ref, base_path="/"):
    if not ref or ref.startswith(("#","mailto:","tel:","javascript:","data:","blob:")):
        return None
    u=urllib.parse.urljoin(LIVE+base_path, ref)
    pu=urllib.parse.urlparse(u)
    if pu.netloc not in ("www.luxwash.online","luxwash.online"):
        return None
    p=pu.path or "/"
    if p.startswith("/api/"):
        return None
    return p

# Determine all public routes from the live sitemap.
sitemap=text_fetch(LIVE+"/sitemap.xml")
save_text("/sitemap.xml",sitemap)
root=ET.fromstring(sitemap)
ns={"s":"http://www.sitemaps.org/schemas/sitemap/0.9"}
routes=[]
for loc in root.findall("s:url/s:loc",ns):
    p=urllib.parse.urlparse((loc.text or "").strip()).path or "/"
    routes.append(p)
for extra in ["/jarvis","/reserveren","/privacy-ai","/controle","/admin","/integraties"]:
    try:
        text_fetch(LIVE+extra)
        routes.append(extra)
    except Exception:
        pass
routes=sorted(set(routes), key=lambda x:(x!="/",x))

asset_queue=set()
route_results=[]
for route in routes:
    try:
        html=strip_cf(text_fetch(LIVE+route))
    except Exception as e:
        route_results.append({"route":route,"error":repr(e)})
        continue
    html=patch_csp(html)
    # Load API proxy shim before application scripts.
    if "/api-proxy.js" not in html:
        html=re.sub(r'(<script[^>]+src=["\']/app\.js["\'][^>]*></script>)',
                    '<script src="/api-proxy.js" defer></script>\n\\1',
                    html, count=1, flags=re.I)
        if "/api-proxy.js" not in html:
            html=html.replace("</body>",'<script src="/api-proxy.js" defer></script>\n</body>')
    if route=="/":
        save_text("/index.html",html)
    else:
        save_text(route.rstrip("/")+"/index.html",html)
    parser=RefParser(); parser.feed(html)
    for ref in parser.refs:
        lp=local_path_from_ref(ref, route if route.endswith("/") else route+"/")
        if lp and lp!="/" and not lp.endswith("/"):
            asset_queue.add(lp)
    route_results.append({"route":route,"bytes":len(html)})

# Seed common top-level assets referenced dynamically.
for p in ["/robots.txt","/manifest.webmanifest","/favicon.ico","/app.js","/analytics.js","/reviews.js","/sw.js","/chatbot.js","/chatbot.css"]:
    asset_queue.add(p)

seen=set()
while asset_queue:
    p=asset_queue.pop()
    if p in seen: 
        continue
    seen.add(p)
    try:
        data,headers,_=fetch(LIVE+p)
    except Exception:
        continue
    ctype=(headers.get("Content-Type") or "").lower()
    text=None
    if any(x in ctype for x in ("text/","javascript","json","xml","svg")) or Path(p).suffix.lower() in {".js",".css",".json",".xml",".svg",".txt",".webmanifest",".html"}:
        text=data.decode("utf-8","ignore")
    if p=="/chatbot.js":
        text=r"""(() => {
  if (window.__LUXWASH_RECEPTION_AI_LOADER__) return;
  window.__LUXWASH_RECEPTION_AI_LOADER__ = true;
  const TOKEN = '597f9789-be65-4ab8-bdbe-276f696991f1';
  const WIDGET = 'https://reception-ai-rho.vercel.app/widget.js';
  function removeLegacy() {
    document.querySelectorAll('.lux-chat,.lux-chat-launcher,.lux-chat-entry,#luxwash-new-chat-v5').forEach(el => el.remove());
  }
  function loadReceptionAI() {
    removeLegacy();
    if (document.getElementById('reception-ai-widget') || window.__RECEPTION_AI_WIDGET_LOADED__) return;
    const script=document.createElement('script');
    script.src=WIDGET;
    script.dataset.widgetToken=TOKEN;
    script.dataset.bottom='92px';
    script.defer=true;
    script.onerror=()=>console.error('Reception AI widget kon niet laden.');
    (document.head||document.documentElement).appendChild(script);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',loadReceptionAI,{once:true});
  else loadReceptionAI();
})();"""
        data=text.encode()
    elif p=="/chatbot.css":
        text=".lux-chat,.lux-chat-launcher,.lux-chat-entry,#luxwash-new-chat-v5{display:none!important;visibility:hidden!important;pointer-events:none!important}\n"
        data=text.encode()
    elif p=="/sw.js":
        text="""self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.map(k=>caches.delete(k)));
  await self.clients.claim();
})()));
"""
        data=text.encode()
    save_bytes(p,data)
    if text:
        # Recursively collect local assets from CSS and JS strings.
        for ref in re.findall(r'url\(["\']?([^"\')]+)', text, re.I):
            lp=local_path_from_ref(ref,p)
            if lp: asset_queue.add(lp)
        for ref in re.findall(r'["\'](/[^"\']+\.(?:png|jpe?g|webp|svg|gif|ico|woff2?|ttf|css|js|json|webmanifest))(?:\?[^"\']*)?["\']', text, re.I):
            asset_queue.add(ref)

api_proxy=r"""(() => {
  const nativeFetch=window.fetch.bind(window);
  const PROXY='https://nahwlhptgdkwhjcfkhkt.supabase.co/functions/v1/luxwash-sites-api-proxy';
  function rewrite(input) {
    try {
      const raw=input instanceof Request ? input.url : String(input);
      const u=new URL(raw,location.href);
      if(u.origin!==location.origin || !u.pathname.startsWith('/api/')) return null;
      const path=u.pathname.slice(5);
      const q=new URLSearchParams(u.search);
      q.set('path',path);
      return PROXY+'?'+q.toString();
    } catch { return null; }
  }
  window.fetch=(input,init)=>{
    const next=rewrite(input);
    if(!next) return nativeFetch(input,init);
    if(input instanceof Request) {
      const cloned=new Request(next,input);
      return nativeFetch(cloned,init);
    }
    return nativeFetch(next,init);
  };
})();
"""
save_text("/api-proxy.js",api_proxy)

# Render clean URLs: rewrite each route to its index.html.
routes_yaml=[]
for route in routes:
    if route=="/": 
        continue
    routes_yaml.append({"type":"rewrite","source":route,"destination":route.rstrip("/")+"/index.html"})
# A trailing slash request should resolve too.
for route in routes:
    if route=="/": 
        continue
    routes_yaml.append({"type":"rewrite","source":route.rstrip("/")+"/","destination":route.rstrip("/")+"/index.html"})
save_text("/render-routes.json",json.dumps(routes_yaml,ensure_ascii=False,indent=2))

# Basic security/cache control metadata used by Render routes/headers config in repo.
print(json.dumps({
    "routes":route_results,
    "route_count":len(routes),
    "files":sum(1 for p in OUT.rglob("*") if p.is_file()),
    "assets_seen":len(seen)
},ensure_ascii=False))
