<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# GOD MODE Hub v8 — private server-backed edition

GOD MODE is a multi-tool AI workspace for chat, code help, image analysis, website/app generation and video generation.

## Security architecture

Gemini is now called from the Node server, not from browser code.

- React + Vite frontend.
- Express server serves the built frontend and the same-origin /api endpoints.
- The Google GenAI SDK is imported only by server.js.
- GEMINI_API_KEY is read from the server process environment only. It is not defined or injected by Vite.
- A private shared-password login issues a signed, eight-hour HttpOnly, SameSite=Strict session cookie.
- Cross-origin POST requests are rejected.
- JPEG, PNG and WEBP uploads are validated and compressed in the browser before they reach the server.
- AI model selection is allowlisted on the server.
- Generated video downloads are fetched by the server; the Google API key is never sent to the browser.
- Baseline security headers are set by Express.

This is a private owner-operated workspace with one shared access password, not a multi-user account system.

## Requirements

- Node.js 20 or newer.
- A Gemini API key with access to the selected Gemini and Veo models.
- A strong private access password (12+ characters).
- A random session signing secret (32+ characters).

## Local setup

Install dependencies with npm install.

Create .env.local in the project root. Use .env.example as a template:

GEMINI_API_KEY=your_private_gemini_key
APP_ACCESS_PASSWORD=use_a_long_unique_password
SESSION_SECRET=paste_a_random_secret_of_at_least_32_characters
PORT=3000

Generate a session secret with:

node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

Start the complete app (Express API + Vite development middleware) with npm run dev.

Open http://localhost:3000.

Do not run Vite directly for end-to-end testing: that serves the frontend without the private /api endpoints.

## Production deployment

Deploy as a Node.js web service (for example, a Cloud Run service), not as a static-only Vite site.

1. Build the frontend with npm run build.
2. Start the service with npm start.
3. Configure the service to listen on the supplied PORT and allow inbound HTTPS traffic through the hosting platform.
4. Add the required environment variables through the platform's secret/environment-variable settings:

| Variable | Required | Purpose |
| --- | --- | --- |
| GEMINI_API_KEY | Yes | Server-only Google Gemini credential |
| APP_ACCESS_PASSWORD | Yes | Private workspace password, 12+ characters |
| SESSION_SECRET | Yes | Random signing secret, 32+ characters |
| PORT | Platform | HTTP port supplied by the host |

Store GEMINI_API_KEY in the platform's secret manager where available. Never add real values to GitHub or the frontend build environment.

For Veo video generation, set the hosting platform's request timeout to at least five minutes. The server polls the generation operation for up to four minutes and then downloads the result server-side.

The existing AI Studio preview is useful for editing, but the production host must actually run npm start so that the server-side endpoints and secrets remain server-side. If the selected deployment flow only publishes static dist files, it is not a valid secure deployment for this version.

## Security and usage limits

- Login attempts: five per IP per 15-minute window per running server process.
- Text/image generation: 30 requests per signed session per hour per running server process.
- Video generation: two requests per signed session per hour per running server process.
- Uploads: JPEG, PNG or WEBP; browser output capped at 4 MB.
- Video download: HTTPS Google-hosted URLs only; 50 MB maximum delivered file.
- No CORS access is enabled for third-party origins.

### Rate-limit limitation

The built-in rate limiter uses in-memory state. It resets when a server process restarts and is not shared across multiple instances. Before exposing the app publicly, add a durable shared rate limiter or platform-level rate limiting, cap the service's maximum instances, and configure Google API quota/billing alerts. The password gate and in-memory limits are not a substitute for platform-level abuse protection.

The current dependency audit still reports one low-severity esbuild advisory affecting esbuild's own Windows development server. This project uses Vite middleware rather than esbuild's standalone serve mode, and the local development server binds to 127.0.0.1. The CI gate blocks high-severity advisories; the low advisory is documented rather than forcing an unverified Vite/esbuild major-version combination.

## Tests

Run npm test and npm run build.

GitHub Actions checks session signing, expiry, same-origin protection, image validation and confirms that the browser source and Vite config do not contain Gemini credentials or direct Google SDK calls.

## Secret handling

- Never commit .env, .env.local, real API keys, passwords or session secrets.
- If a Gemini key was ever exposed in a public browser bundle, revoke it in Google AI Studio / Google Cloud and create a replacement.
- Do not reuse your email, banking or other account password for APP_ACCESS_PASSWORD.
- Do not share secrets in ChatGPT messages or GitHub issues.

## Project layout

- server.js
- server/security.js
- src/App.tsx
- src/main.tsx
- src/index.css
- vite.config.ts
- tests/godmode-security.test.mjs

Other Hub subprojects and their existing branches are not modified by this GOD MODE security change.
