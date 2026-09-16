from pathlib import Path

p = Path('app/src/main/java/online/luxwash/tradebot/MainActivity.java')
s = p.read_text()

s = s.replace(
'''        setContentView(buildUi());
        ui.post(autoRefresh);''',
'''        setContentView(buildUi());
        String saved = prefs.getString("base_url", "");
        if (saved == null || saved.trim().isEmpty() || saved.contains("192.168.1.10")) {
            prefs.edit().remove("base_url").apply();
            ui.postDelayed(this::discoverBackend, 300);
        }
        ui.post(autoRefresh);''')

s = s.replace(
'''        refreshButton = button("VERVERS NU", v -> refresh()); root.addView(refreshButton);
        root.addView(button("INSTELLINGEN", v -> showSettings()));''',
'''        refreshButton = button("VERVERS NU", v -> refresh()); root.addView(refreshButton);
        root.addView(button("ZOEK BACKEND", v -> discoverBackend()));
        root.addView(button("INSTELLINGEN", v -> showSettings()));''')

s = s.replace(
'''        return new ApiClient(prefs.getString("base_url", "http://192.168.1.10:8787"), securePrefs.loadToken());''',
'''        return new ApiClient(prefs.getString("base_url", ""), securePrefs.loadToken());''')

marker = '''    private void postAction(String path) {'''
method = '''    private void discoverBackend() {
        errorText.setText("Backend zoeken op huidig wifi/LAN…");
        statusBadge.setText("STATUS: ZOEKEN…");
        io.execute(() -> {
            try {
                String found = Discovery.find(securePrefs.loadToken());
                if (found == null) throw new IllegalStateException("Geen backend gevonden. Start eerst de tradebot op de pc/server en zorg dat beide toestellen op hetzelfde netwerk zitten.");
                prefs.edit().putString("base_url", found).apply();
                ui.post(() -> { toast("Backend gevonden: " + found); refresh(); });
            } catch (Exception e) {
                ui.post(() -> {
                    statusBadge.setText("STATUS: OFFLINE");
                    statusBadge.setBackgroundColor(Color.rgb(255,220,220));
                    errorText.setText("Zoeken mislukt: " + e.getMessage());
                });
            }
        });
    }

'''
if method not in s:
    s = s.replace(marker, method + marker)

s = s.replace(
'''        EditText url = new EditText(this); url.setHint("Backend URL"); url.setSingleLine(true); url.setText(prefs.getString("base_url", "http://192.168.1.10:8787")); form.addView(url);''',
'''        EditText url = new EditText(this); url.setHint("Backend URL (optioneel)"); url.setSingleLine(true); url.setText(prefs.getString("base_url", "")); form.addView(url);''')

s = s.replace(
'''        TextView help = text("Voor lokaal gebruik: vul het LAN-IP van de computer met de Python tradebot in, bv. http://192.168.1.25:8787. Gebruik geen exchange API-key in deze app.", 13); form.addView(help);''',
'''        TextView help = text("Laat de URL leeg en gebruik ZOEK BACKEND, of vul het LAN-IP van de pc/server in. Gebruik nooit je exchange API-key in deze app.", 13); form.addView(help);''')

p.write_text(s)

manifest = Path('app/src/main/AndroidManifest.xml')
m = manifest.read_text()
if 'ACCESS_NETWORK_STATE' not in m:
    m = m.replace('<uses-permission android:name="android.permission.INTERNET" />', '<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />\n    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />')
manifest.write_text(m)

build = Path('app/build.gradle')
b = build.read_text().replace('versionCode 1', 'versionCode 2').replace("versionName '1.0.0'", "versionName '1.1.0'")
build.write_text(b)

assert 'ZOEK BACKEND' in s
assert 'Discovery.find' in s
assert "versionName '1.1.0'" in b
