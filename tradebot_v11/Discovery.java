package online.luxwash.tradebot;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.List;
import java.util.concurrent.CompletionService;
import java.util.concurrent.ExecutorCompletionService;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

public final class Discovery {
    private Discovery() {}

    private static String localIpv4() throws Exception {
        String fallback = null;
        Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
        while (interfaces.hasMoreElements()) {
            NetworkInterface ni = interfaces.nextElement();
            if (!ni.isUp() || ni.isLoopback()) continue;
            Enumeration<InetAddress> addrs = ni.getInetAddresses();
            while (addrs.hasMoreElements()) {
                InetAddress a = addrs.nextElement();
                if (!(a instanceof Inet4Address) || a.isLoopbackAddress() || !a.isSiteLocalAddress()) continue;
                String ip = a.getHostAddress();
                String name = ni.getName() == null ? "" : ni.getName().toLowerCase();
                if (name.startsWith("wlan") || name.startsWith("wifi") || ip.startsWith("192.168.")) return ip;
                if (fallback == null) fallback = ip;
            }
        }
        return fallback;
    }

    private static String read(InputStream in) throws Exception {
        if (in == null) return "";
        StringBuilder b = new StringBuilder();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) b.append(line);
        }
        return b.toString();
    }

    private static boolean probe(String baseUrl, String token) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(baseUrl + "/api/status").openConnection();
            c.setRequestMethod("GET");
            c.setConnectTimeout(350);
            c.setReadTimeout(600);
            c.setRequestProperty("X-Dashboard-Token", token == null ? "" : token);
            c.setRequestProperty("Accept", "application/json");
            int code = c.getResponseCode();
            String body = read(code >= 200 && code < 300 ? c.getInputStream() : c.getErrorStream());
            return code == 200 || (code == 401 && body.toLowerCase().contains("dashboard token"));
        } catch (Exception ignored) {
            return false;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    public static String find(String token) throws Exception {
        String ip = localIpv4();
        if (ip == null || !ip.contains(".")) throw new IllegalStateException("Geen lokaal wifi/LAN-adres gevonden");
        String prefix = ip.substring(0, ip.lastIndexOf('.') + 1);
        ExecutorService pool = Executors.newFixedThreadPool(32);
        CompletionService<String> cs = new ExecutorCompletionService<>(pool);
        List<Future<String>> jobs = new ArrayList<>();
        try {
            for (int i = 1; i <= 254; i++) {
                final String candidate = "http://" + prefix + i + ":8787";
                jobs.add(cs.submit(() -> probe(candidate, token) ? candidate : null));
            }
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(9);
            for (int i = 0; i < 254 && System.nanoTime() < deadline; i++) {
                Future<String> f = cs.poll(450, TimeUnit.MILLISECONDS);
                if (f == null) continue;
                String found = f.get();
                if (found != null) return found;
            }
            return null;
        } finally {
            for (Future<String> f : jobs) f.cancel(true);
            pool.shutdownNow();
        }
    }
}
