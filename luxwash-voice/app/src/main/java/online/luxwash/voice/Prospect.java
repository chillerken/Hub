package online.luxwash.voice;

public final class Prospect {
    public String name;
    public String sector;
    public String website;
    public String email;
    public String phone;

    public Prospect(String name, String sector, String website, String email, String phone) {
        this.name = safe(name);
        this.sector = safe(sector);
        this.website = safe(website);
        this.email = safe(email);
        this.phone = safe(phone);
    }

    private static String safe(String v) { return v == null ? "" : v.trim(); }

    public String key() {
        String e = email.toLowerCase();
        String w = website.toLowerCase().replace("https://", "").replace("http://", "").replace("www.", "");
        if (!e.isEmpty()) return "email:" + e;
        if (!w.isEmpty()) return "web:" + w;
        return "name:" + name.toLowerCase() + "|" + sector.toLowerCase();
    }
}
