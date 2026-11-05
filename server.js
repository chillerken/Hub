import express from "express";
import dotenv from "dotenv";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";
import {
  clearSessionCookie,
  createSessionValue,
  getClientIp,
  getSession,
  isSameOrigin,
  makeSessionCookie,
  parseImageDataUrl,
  passwordMatches,
  resetRateLimit,
  takeRateLimit
} from "./server/security.js";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(rootDir, ".env.local") });
dotenv.config({ path: path.join(rootDir, ".env") });

const isProduction = process.argv.includes("--production") ||
  (!process.argv.includes("--dev") && process.env.NODE_ENV === "production");
process.env.NODE_ENV = isProduction ? "production" : "development";
const app = express();
const httpServer = createServer(app);
const allowedModels = new Set(["gemini-3-flash-preview", "gemini-3.1-pro-preview"]);
const VIDEO_MODEL = "veo-3.1-fast-generate-preview";

app.disable("x-powered-by");
// Trust only the nearest hosting proxy when resolving req.ip for throttling.
app.set("trust proxy", 1);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cache-Control", "no-store");
  if (isProduction) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});
app.use("/api/auth", express.json({ limit: "8kb" }));
app.use("/api/gemini", express.json({ limit: "8mb" }));

function requireSameOrigin(req, res) {
  if (isSameOrigin(req)) return true;
  res.status(403).json({ error: "Cross-origin request rejected." });
  return false;
}

function requireSession(req, res) {
  const session = getSession(req);
  if (session) return session;
  res.status(401).json({ error: "Your session has expired. Sign in again." });
  return null;
}

function getApiKey(res) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) return apiKey;
  res.status(503).json({ error: "The server-side Gemini API key is not configured." });
  return null;
}

function enforceLimit(req, res, key, limit, windowMs) {
  const result = takeRateLimit(key, limit, windowMs);
  if (result.allowed) return true;
  res.setHeader("Retry-After", String(result.retryAfterSeconds));
  res.status(429).json({ error: "Usage limit reached. Please try again later." });
  return false;
}

function isAllowedVideoUrl(url) {
  return url.protocol === "https:" &&
    !url.username && !url.password &&
    (!url.port || url.port === "443") &&
    ["generativelanguage.googleapis.com", "storage.googleapis.com"].includes(url.hostname);
}

async function fetchGoogleVideo(startUrl, apiKey) {
  let currentUrl = startUrl;
  const signal = AbortSignal.timeout(60_000);

  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    if (!isAllowedVideoUrl(currentUrl)) {
      throw new Error("The video provider returned an unsupported download location.");
    }

    const headers = currentUrl.hostname === "generativelanguage.googleapis.com"
      ? { "x-goog-api-key": apiKey }
      : {};
    const response = await fetch(currentUrl, {
      method: "GET",
      headers,
      redirect: "manual",
      signal
    });

    if (response.status < 300 || response.status >= 400) return response;

    const location = response.headers.get("location");
    await response.body?.cancel().catch(() => {});
    if (!location || redirectCount === 3) {
      throw new Error("The video provider returned an invalid redirect.");
    }
    currentUrl = new URL(location, currentUrl);
  }

  throw new Error("The video provider returned too many redirects.");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.get("/api/auth", (req, res) => {
  res.json({ authenticated: Boolean(getSession(req)) });
});

app.post("/api/auth", (req, res) => {
  if (!requireSameOrigin(req, res)) return;

  const action = req.body?.action;
  if (action === "logout") {
    res.setHeader("Set-Cookie", clearSessionCookie(req));
    res.json({ authenticated: false });
    return;
  }
  if (action !== "login") {
    res.status(400).json({ error: "Unsupported authentication action." });
    return;
  }

  const configuredPassword = process.env.APP_ACCESS_PASSWORD;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!configuredPassword || configuredPassword.length < 12 ||
      !sessionSecret || sessionSecret.length < 32) {
    res.status(503).json({
      error: "Server access is not configured. Set APP_ACCESS_PASSWORD and SESSION_SECRET."
    });
    return;
  }

  const ipHash = createHash("sha256").update(getClientIp(req)).digest("hex");
  const rateKey = "login:" + ipHash;
  if (!enforceLimit(req, res, rateKey, 5, 15 * 60 * 1000)) return;

  if (!passwordMatches(req.body?.password, configuredPassword)) {
    res.status(401).json({ error: "Incorrect access password." });
    return;
  }

  resetRateLimit(rateKey);
  res.setHeader("Set-Cookie", makeSessionCookie(createSessionValue(sessionSecret), req));
  res.json({ authenticated: true });
});

app.post("/api/gemini/generate", async (req, res) => {
  if (!requireSameOrigin(req, res)) return;
  const session = requireSession(req, res);
  if (!session) return;
  const apiKey = getApiKey(res);
  if (!apiKey) return;

  if (!enforceLimit(req, res, "generate:" + session.id, 30, 60 * 60 * 1000)) return;

  const prompt = req.body?.prompt;
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 50000) {
    res.status(400).json({ error: "Provide a prompt between 1 and 50,000 characters." });
    return;
  }

  let image = null;
  if (req.body?.image) {
    image = parseImageDataUrl(req.body.image);
    if (!image) {
      res.status(400).json({ error: "Upload a valid JPEG, PNG or WEBP image (maximum 4 MB after compression)." });
      return;
    }
  }

  const model = req.body?.model ?? "gemini-3-flash-preview";
  if (typeof model !== "string" || !allowedModels.has(model)) {
    res.status(400).json({ error: "The selected Gemini model is not supported." });
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const contents = image
      ? { parts: [{ text: prompt }, { inlineData: { mimeType: image.mimeType, data: image.data } }] }
      : prompt;
    const response = await ai.models.generateContent({
      model,
      contents,
      config: { maxOutputTokens: 8192 }
    });
    const text = response.text;
    if (typeof text !== "string" || !text.trim()) {
      res.status(502).json({ error: "Gemini returned an empty response." });
      return;
    }
    res.json({ text });
  } catch (error) {
    console.error("Gemini generateContent failed:", error?.status || error?.name || "unknown");
    res.status(502).json({ error: "Gemini could not complete the request. Check the model and server configuration." });
  }
});

app.post("/api/gemini/video", async (req, res) => {
  if (!requireSameOrigin(req, res)) return;
  const session = requireSession(req, res);
  if (!session) return;
  const apiKey = getApiKey(res);
  if (!apiKey) return;

  if (!enforceLimit(req, res, "video:" + session.id, 2, 60 * 60 * 1000)) return;

  const prompt = req.body?.prompt;
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 4000) {
    res.status(400).json({ error: "Provide a video prompt between 1 and 4,000 characters." });
    return;
  }

  let image = null;
  if (req.body?.image) {
    image = parseImageDataUrl(req.body.image);
    if (!image) {
      res.status(400).json({ error: "The reference image is invalid or too large." });
      return;
    }
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    let operation = await ai.models.generateVideos({
      model: VIDEO_MODEL,
      prompt,
      image: image ? { imageBytes: image.data, mimeType: image.mimeType } : undefined,
      config: {
        numberOfVideos: 1,
        resolution: "720p",
        aspectRatio: "16:9"
      }
    });

    const deadline = Date.now() + 240_000;
    while (!operation.done && Date.now() < deadline) {
      await sleep(5000);
      operation = await ai.operations.getVideosOperation({ operation });
    }

    if (!operation.done) {
      res.status(504).json({ error: "Video generation is taking longer than expected. Try again later." });
      return;
    }
    if (operation.error) {
      res.status(502).json({ error: "The video provider could not complete this generation." });
      return;
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) {
      res.status(502).json({ error: "The video provider returned no downloadable video." });
      return;
    }

    const videoUrl = new URL(downloadLink);
    if (!isAllowedVideoUrl(videoUrl)) {
      res.status(502).json({ error: "The video provider returned an unsupported download location." });
      return;
    }

    const download = await fetchGoogleVideo(videoUrl, apiKey);
    if (!download.ok) {
      res.status(502).json({ error: "The generated video could not be downloaded." });
      return;
    }

    const maxVideoBytes = 50 * 1024 * 1024;
    const declaredLength = Number(download.headers.get("content-length") || 0);
    if (declaredLength > maxVideoBytes || !download.body) {
      await download.body?.cancel().catch(() => {});
      res.status(502).json({ error: "The generated video is empty or exceeds the 50 MB delivery limit." });
      return;
    }

    const reader = download.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxVideoBytes) {
        await reader.cancel().catch(() => {});
        res.status(502).json({ error: "The generated video exceeds the 50 MB delivery limit." });
        return;
      }
      chunks.push(Buffer.from(value));
    }

    if (!totalBytes) {
      res.status(502).json({ error: "The video provider returned an empty file." });
      return;
    }
    const videoBytes = Buffer.concat(chunks, totalBytes);

    res.status(200);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Length", String(videoBytes.length));
    res.setHeader("Cache-Control", "no-store");
    res.end(videoBytes);
  } catch (error) {
    console.error("Gemini video generation failed:", error?.status || error?.name || "unknown");
    res.status(502).json({ error: "Video generation failed. Check the model, quota and server configuration." });
  }
});

const port = Number(process.env.PORT || 3000);
if (process.env.NODE_ENV === "production") {
  const distDir = path.join(rootDir, "dist");
  app.use(express.static(distDir));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api/")) {
      res.status(404).json({ error: "API endpoint not found." });
      return;
    }
    res.sendFile(path.join(distDir, "index.html"));
  });
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    configFile: path.join(rootDir, "vite.config.ts"),
    server: {
      middlewareMode: true,
      hmr: process.env.DISABLE_HMR === "true" ? false : { server: httpServer }
    },
    appType: "spa"
  });
  app.use(vite.middlewares);
}

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number(error?.status || error?.statusCode);
  if (status === 413) {
    res.status(413).json({ error: "The request is too large. Reduce the prompt or image size." });
    return;
  }
  console.error("Request processing failed:", error?.name || "unknown");
  res.status(400).json({ error: "The request could not be processed." });
});

const bindHost = isProduction ? "0.0.0.0" : "127.0.0.1";
httpServer.listen(port, bindHost, () => {
  console.log("GOD MODE server listening on port " + port);
});
