# mijn.ai Business — Cloudflare Pages

Production branch: main
Root directory: ai-receptionist-host
Framework preset: None
Build command: exit 0
Build output directory: .

The frontend is static. Supabase remains the backend/auth/AI layer.

After first successful Pages deploy:
1. Verify login, public widget, plan locks and Stripe redirects.
2. Change Stripe Payment Link after_completion redirects from the old Vercel hostname to the new Pages/custom domain.
3. Keep Vercel online until all smoke tests pass.
