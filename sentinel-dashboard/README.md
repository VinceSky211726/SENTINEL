# Sentinel Dashboard

Interface Next.js 14 (App Router) pour le fil d’alertes Sentinel, branchée sur Supabase.

## Prérequis

- Node.js 18+
- Projet Supabase SENTINEL avec tables `portfolio`, `events`, `feedback`, `source_registry`
- Clé **publishable** (`sb_publishable_…`) — jamais la clé secrète / `service_role` (exposée dans le navigateur)

## Installation locale

```bash
cd sentinel-dashboard
cp .env.local.example .env.local
# Renseigner NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY (publishable)
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

## Écrans

| Route | Description |
|-------|-------------|
| `/` | Fil d’alertes (`filter_passed=true`), filtres, Realtime |
| `/alert/[id]` | Détail, feedback, marque `is_read=true` |
| `/portfolio` | Lignes, sparkline, seuil, toggle actif |
| `/brief` | Sentiment du jour, à surveiller, stats pipeline |

## Realtime

La table `events` est publiée sur `supabase_realtime`. Les nouvelles alertes apparaissent en tête du fil avec animation.

## Déploiement Vercel

1. Pousser le repo sur GitHub
2. [vercel.com](https://vercel.com) → **Import Project** → dossier `sentinel-dashboard` (ou racine si monorepo)
3. **Environment Variables** :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → clé **publishable** (`sb_publishable_…`), pas `sb_secret_`
4. Deploy

Framework preset : **Next.js**. Build command : `npm run build`. Output : défaut.

## Stack

- Next.js 14 · TypeScript · Tailwind CSS
- `@supabase/supabase-js` (gratuit)
- IBM Plex Sans / Mono (Google Fonts)

Coût infra : **0 €** (Vercel hobby + Supabase free tier).
