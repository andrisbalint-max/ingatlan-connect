# Ingatlan Connect

Build the foundation of a modern internal B2B industrial real estate 

broker platform for the Hungarian market. Private MVP for 1 organization.

═══ DESIGN ═══

Clean minimalist SaaS style (like Linear/Notion):

- White background #FFFFFF / #F8FBFC

- Teal accent #00A8B5 (buttons, links, active states)

- Header: full-width teal bar, white text navigation

- Cards: white, soft shadow, light border #EEF4F5, 12px rounded corners,

  generous whitespace

- Font: Inter, Lucide icons (thin line)

- Entire UI in HUNGARIAN

═══ AUTH ═══

Email + password login via Supabase Auth.

Login page: centered clean card on white background with teal accents.

After signup, the first user becomes admin.

═══ NAVIGATION (teal header, active item = semi-transparent white pill) ═══

Áttekintés | Email sor | CRM | Projektek | Riportok | Beállítások

═══ DATABASE (Supabase, RLS enabled, multi-tenant ready - every table 

has organization_id) ═══

- organizations (id, name, created_at)

- profiles (id, auth_user_id, organization_id, email, name, role 

  [admin|user|viewer], created_at)

- companies (id, organization_id, name, domain, industry, city,

  status [nincs_valasz|valaszolt|erdeklodik|lezarva], opt_out boolean,

  notes, created_at)

- contacts (id, organization_id, company_id, name, email, phone, position)

- emails_queue (id, organization_id, company_id, contact_id, subject,

  body, status [varakozik|jovahagyva|elkuldot|elvetve], ai_generated,

  approved_at, sent_at, follow_up_number, scheduled_for)

- responses (id, organization_id, email_id, received_at, raw_text,

  category [erdeklodes|talalkozo|elutasitas|kerdes|autovalasz], handled)

- projects (id, organization_id, title, description, city, size_sqm,

  status, created_at)

- project_files (id, organization_id, project_id, filename, storage_path,

  ai_summary, uploaded_at)

- market_reports (id, organization_id, report_date, source_name, title,

  summary, key_data jsonb, year, created_at)

- daily_digests (id, organization_id, date, content_markdown, created_at)

- settings (id, organization_id, hunter_api_key, openai_api_key,

  outlook_connected boolean, daily_email_limit int default 30,

  send_window_start time default '09:00', send_window_end time '16:00')

Auto-create profile + settings row + link to organization when a user 

signs up. First user's role = admin.

═══ PAGES TO BUILD NOW ═══

1. Login page

2. Áttekintés (dashboard): 4 stat cards ("Email vár jóváhagyásra",

   "Ma elküldve", "Válaszok tegnap", "Aktív projektek") with real counts

   from DB (0 values fine for now), plus recent activity list placeholder

3. Felhasználók tab (visible only to admin): list users from profiles,

   change role dropdown (admin/user/viewer)

4. Empty placeholder pages for Email sor, CRM, Projektek, Riportok, 

   Beállítások with just the page title - we build them next

Responsive layout. Handle Hungarian characters correctly.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f1bf2ada-68ea-4e6b-8fce-fe3aa34ea1d4).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
