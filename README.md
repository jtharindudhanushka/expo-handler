# Career Fair Queue Management System

A real-time, Next.js (App Router) and Firebase based queue management system designed for career fairs with multiple interviewing rooms.

## Tech Stack
-   **Framework:** Next.js (App Router)
-   **Styling:** Tailwind CSS + shadcn-like custom UI components
-   **Database:** Firebase Firestore (Real-time updates)
-   **Deployment:** Vercel

## System Views
1.  **Registration View (`/`)**: Front desk interface to register candidates and add them to specific company queues.
2.  **Room Lead Dashboard (`/room`)**: Smart queue interface for company representatives. Automatically disables candidates who are currently interviewing in a different room.
3.  **Public Board (`/board`)**: Large digital signage for the waiting area showing who is currently called and to which room.

---

## 🚀 Deployment Guide (10 Minutes)

### Step 1: Set up Firebase
1. Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project.
2. Navigate to **Firestore Database** in the left sidebar and click "Create Database". Start in **Test Mode** for this demo (or set up proper security rules later).
3. Go to **Project Settings** (the gear icon) > **General**.
4. Scroll down to "Your apps" and click the web icon (`</>`) to add a new web app. Register the app.
5. Copy the configuration object provided by Firebase.

### Step 2: Configure Environment Variables
You need to add the Firebase configuration to your environment variables.
In your Vercel project settings (or locally in `.env.local`), add the following keys based on your Firebase config:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef
```

### Step 3: Deploy to Vercel
1. Push this repository to GitHub.
2. Log in to [Vercel](https://vercel.com) and click "Add New Project".
3. Import your GitHub repository.
4. Expand the "Environment Variables" section and paste in all the `NEXT_PUBLIC_FIREBASE_*` variables from Step 2.
5. Click **Deploy**. Vercel will build and deploy the application seamlessly.

### Step 4: First-time usage (Seeding Data)
1. Open the deployed application's home page (`/`).
2. If your database is empty, you will see a text saying "No companies found in database."
3. Click the **"Seed Sample Companies"** button. This will instantly populate Firestore with 3 sample companies and their room numbers.
4. You're ready to start using the queue system! Open `/`, `/room`, and `/board` in different windows to see the real-time syncing in action.
