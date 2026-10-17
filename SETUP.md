# ILC Studios, Lighting Budget Tool

## First-Time Setup (One Time Only)

### Step 1: Install Node.js
Download and install Node.js from: https://nodejs.org
Choose the **LTS (Long Term Support)** version.

After installing, restart your computer.

---

### Step 2: Open a Terminal in this folder
- Open **File Explorer** and navigate to this folder
- Right-click in the folder and select **"Open in Terminal"**
  - (Or press `Win + R`, type `cmd`, press Enter, then type `cd "G:\My Drive\BUDGETING TOOL SOFTWARE\ilc-lighting-app"`)

---

### Step 3: Run setup (one time)
Copy and paste these commands one at a time:

```
npm install
npx prisma db push
node prisma/seed.js
```

---

### Step 4: Start the app
```
npm run dev
```

Then open your browser to: **http://localhost:3000**

---

## Default Login (ILC Admin)

| Field    | Value              |
|----------|--------------------|
| Email    | admin@ilcstudios.com |
| Password | ILCadmin2024!      |

**Change this password after first login by inviting yourself through the Admin panel.**

---

## Daily Use (After Setup)

1. Open terminal in this folder
2. Run: `npm run dev`
3. Open browser to: `http://localhost:3000`
4. Press `Ctrl+C` in the terminal to stop the app

---

## User Roles

| Role      | Can Do                                               |
|-----------|------------------------------------------------------|
| ILC_ADMIN | Everything, manage all users, pricing logic is internal |
| ADMIN     | Invite users, view all their company's projects      |
| USER      | Create and manage their own projects                 |

---

## Inviting Clients / Users

1. Log in as Admin
2. Go to **Admin** in the top navigation
3. Click **"Invite User"** tab
4. Enter their email and choose role
5. Copy the generated invite link and send it to them
6. They click the link, set a name and password, and can start building budgets

---

## Deploying to AWS (When Ready)

When ready to go live, the app can be deployed to:
- **AWS Amplify** (simplest, connects to your GitHub, auto-deploys)
- **EC2** (more control)
- **Vercel** (easiest of all, free tier available)

Database will switch from SQLite to **PostgreSQL (AWS RDS)**, just update the `.env` file.
