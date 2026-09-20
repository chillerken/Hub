package online.luxwash.voice;

import android.content.Context;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.*;
import javax.net.ssl.HttpsURLConnection;

public final class ProspectFinder {
    private static final String OVERPASS = "https://overpass-api.de/api/interpreter";
    private static final Pattern EMAIL = Pattern.compile("[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}", Pattern.CASE_INSENSITIVE);

    public static List<Prospect> findNew(Context ctx, int max) throws Exception {
        String q = "[out:json][timeout:25];(" +
                "nwr[\"name\"][\"shop\"~\"car|car_repair|car_parts\"](around:18000,50.945,3.99);" +
                "nwr[\"name\"][\"amenity\"=\"taxi\"](around:18000,50.945,3.99);" +
                "nwr[\"name\"][\"office\"~\"estate_agent|company|logistics\"](around:18000,50.945,3.99);" +
                "nwr[\"name\"][\"amenity\"~\"restaurant|cafe|clinic\"](around:18000,50.945,3.99);" +
                ");out center tags 100;";

        String body = "data=" + URLEncoder.encode(q, StandardCharsets.UTF_8.name());
        HttpsURLConnection c = (HttpsURLConnection) new URL(OVERPASS).openConnection();
        c.setConnectTimeout(12000); c.setReadTimeout(30000); c.setRequestMethod("POST");
        c.setRequestProperty("Content-Type","application/x-www-form-urlencoded; charset=UTF-8");
        c.setRequestProperty("User-Agent","LuxWashVoice/1.0 (+https://www.luxwash.online)");
        c.setDoOutput(true);
        try(OutputStream os=c.getOutputStream()) { os.write(body.getBytes(StandardCharsets.UTF_8)); }
        if (c.getResponseCode() < 200 || c.getResponseCode() >= 300) throw new IOException("Bedrijfszoeker gaf HTTP " + c.getResponseCode());

        String json = readAll(c.getInputStream(), 2_000_000);
        JSONArray elements = new JSONObject(json).optJSONArray("elements");
        if (elements == null) return Collections.emptyList();

        DbHelper db = new DbHelper(ctx);
        List<Prospect> out = new ArrayList<>();
        Set<String> seen = new HashSet<>();

        for (int i=0; i<elements.length() && out.size()<max*3; i++) {
            JSONObject tags = elements.getJSONObject(i).optJSONObject("tags");
            if (tags == null) continue;
            String name = tags.optString("name","");
            if (name.isEmpty()) continue;
            String sector = sector(tags);
            if (sector.equals("bouw")) continue;
            String website = first(tags, "contact:website","website","url");
            String email = first(tags, "contact:email","email");
            String phone = first(tags, "contact:phone","phone");
            Prospect p = new Prospect(name, sector, website, email, phone);
            if (!seen.add(p.key()) || db.isKnown(p.key())) continue;
            out.add(p);
        }

        int scraped = 0;
        for (Prospect p : out) {
            if (scraped >= 12) break;
            if (p.email.isEmpty() && !p.website.isEmpty()) {
                scraped++;
                String found = scrapeEmail(p.website);
                if (!found.isEmpty()) p.email = found;
            }
        }

        out.sort((a,b) -> Boolean.compare(!a.email.isEmpty(), !b.email.isEmpty()) * -1);
        if (out.size() > max) return new ArrayList<>(out.subList(0, max));
        return out;
    }

    private static String sector(JSONObject t) {
        String shop=t.optString("shop","");
        String office=t.optString("office","");
        String amenity=t.optString("amenity","");
        String craft=t.optString("craft","");
        if (craft.contains("construction") || office.contains("construction")) return "bouw";
        if (shop.contains("car")) return "automotive";
        if (amenity.equals("taxi")) return "taxi";
        if (office.equals("estate_agent")) return "vastgoed";
        if (office.equals("logistics")) return "transport";
        if (amenity.equals("restaurant") || amenity.equals("cafe")) return "horeca";
        if (amenity.equals("clinic")) return "praktijk";
        return office.isEmpty() ? "bedrijf" : office;
    }

    private static String first(JSONObject o, String... keys) {
        for(String k:keys){ String v=o.optString(k,"").trim(); if(!v.isEmpty()) return v; }
        return "";
    }

    private static String scrapeEmail(String rawUrl) {
        try {
            String u = rawUrl.startsWith("http://") || rawUrl.startsWith("https://") ? rawUrl : "https://" + rawUrl;
            URL url = new URL(u);
            URLConnection con = url.openConnection();
            con.setConnectTimeout(6000); con.setReadTimeout(7000);
            con.setRequestProperty("User-Agent","Mozilla/5.0 LuxWashVoice/1.0");
            String html = readAll(con.getInputStream(), 500_000);
            Matcher m = EMAIL.matcher(html);
            while(m.find()) {
                String e=m.group().toLowerCase(Locale.ROOT);
                if (!e.contains("example.") && !e.startsWith("noreply@") && !e.endsWith(".png") && !e.endsWith(".jpg")) return e;
            }
        } catch(Exception ignored) {}
        return "";
    }

    private static String readAll(InputStream in, int max) throws IOException {
        try(BufferedInputStream bin=new BufferedInputStream(in); ByteArrayOutputStream bout=new ByteArrayOutputStream()) {
            byte[] buf=new byte[8192]; int n,total=0;
            while((n=bin.read(buf))!=-1){ if(total+n>max) n=max-total; if(n<=0) break; bout.write(buf,0,n); total+=n; if(total>=max) break; }
            return bout.toString(StandardCharsets.UTF_8.name());
        }
    }
}
