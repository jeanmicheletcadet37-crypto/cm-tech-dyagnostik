# CM TECH SOLUTION Dyagnostik — Sèvè (PostgreSQL)

## Kijan pou kouri l sou òdinatè w

1. Enstale [Node.js](https://nodejs.org) si li poko sou òdinatè a (vèsyon 18 oswa plis).
2. Dekonpwese (unzip) dosye sa a, louvri yon tèminal ladan l.
3. Enstale sèl depandans ki genyen an (`pg`, pou pale ak PostgreSQL):
   ```
   npm install
   ```
4. Kopye `.env.example` rele l `.env`, epi mete vrè `DATABASE_URL` ou (gade seksyon anba a pou jwenn youn gratis).
5. Kouri:
   ```
   node server.js
   ```
6. Louvri navigatè a sou: **http://localhost:3000**

Premye fwa sèvè a kouri, li kreye tab yo otomatikman epi simen 2 kont demo:
- **Admin**: `admin` / `admin123`
- **Teknisyen**: `demo` / `demo123`

## Jwenn yon baz done PostgreSQL gratis (sou Render)

1. Kreye kont gratis sou [render.com](https://render.com).
2. Klike **New → PostgreSQL**, bay li yon non, chwazi plan **Free**.
3. Apre l fin kreye, kopye valè **"External Database URL"** la — se sa ki ale nan `DATABASE_URL` nan fichye `.env` ou a.
4. Mete `PGSSL=true` nan menm fichye `.env` la (Render mande SSL).

**Atansyon**: Postgres gratis Render a gen yon limit — li ka ekspire apre yon tan si pa gen aktivite (verifye sou dashboard Render ou a pou konnen dire aktyèl la, sa chanje detanzantan). Pou yon sistèm biznis serye alontèm, konsidere yon plan peyan pou Postgres la, ki pa gen limit sa a.

## Deplwaye sèvè a sou entènèt (pou tout teknisyen aksè l toupatou)

1. Mete kontni dosye sa a nan yon repo GitHub.
2. Sou Render: **New → Web Service**, konekte repo a.
3. Build command: `npm install`. Start command: `node server.js`.
4. Anba "Environment", ajoute `DATABASE_URL` (menm valè ak pi wo a) ak `PGSSL=true`.
5. Chwazi plan **Free**, klike **Deploy**.
6. Ou resevwa yon adrès tankou `https://cm-tech-dyagnostik.onrender.com` — se sa tout teknisyen itilize.

**Nòt**: sèvè web plan gratis la ka "dòmi" apre 15 minit san itilizasyon (30-60 segonn pou reveye). Sa pa afekte done yo ankò — yo sove nan Postgres, pa sou disk sèvè web la — se sèlman yon ti reta lè l ap reveye.

## Kijan done yo pataje

Tout teknisyen ki konekte sou **menm sèvè a**, kèlkeswa aparèy yo, wè menm biznis, menm lis teknisyen (si yo admin), ak menm istorik dyagnostik pou biznis pa yo a — paske tout bagay sove nan **yon sèl baz done Postgres santral**, pa sou aparèy endividyèl.

## Sekirite — enpòtan anvan pwodiksyon reyèl

- Modpas yo chifre (hash) ak `scrypt` + yon "salt" pou chak itilizatè — yo pa janm sove an tèks kout.
- Sesyon yo (token koneksyon) sove an memwa sèvè a — yo efase si sèvè a rekòmanse (teknisyen yo ap bezwen rekonekte).
- Pa gen limit sou tantativ modpas (rate limiting) pou kounye a — sa ta bon pou ajoute anvan yon vrè lansman.
- `.env` ou a gen enfòmasyon sansib (modpas baz done) — pa janm mete l nan yon repo GitHub piblik.

## Estrikti dosye

```
cm-tech-backend/
├── server.js          ← sèvè a (Node.js + pg pou PostgreSQL)
├── package.json        ← lis depandans (sèlman "pg")
├── .env.example         ← modèl pou konfigirasyon (DATABASE_URL, elatriye)
└── public/index.html   ← aplikasyon web la (frontend)
```
