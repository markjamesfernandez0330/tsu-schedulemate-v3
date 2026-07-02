# TSU Scheduling System

A Microsoft-authenticated scheduling app built with **TanStack Start**, **React**, **Tailwind CSS**, and **Firebase** (Auth + Firestore).

- Students book AM/PM appointments on a calendar and print a receipt.
- Admins manage schedules, reasons, unavailable dates, admins, users, and reports.
- Bootstrap admin: `mjfernandez@tsu.edu.ph` — every other admin is added from the admin panel.

---

## 1. Prerequisites

- **Node.js 20+**
- **[Bun](https://bun.sh/)** (recommended) or npm / pnpm
- A Firebase project (already provided: `scheduling-system-a0cf9`)
- An Azure AD app registration for Microsoft OAuth

## 2. Install

```bash
bun install
# or: npm install
```

## 3. Configure Firebase & Microsoft OAuth

Firebase config lives in [`src/lib/firebase.ts`](src/lib/firebase.ts). Update these constants if needed:

```ts
export const ADMIN_EMAIL   = "mjfernandez@tsu.edu.ph";
export const MS_TENANT_ID  = "a5ec38cc-20b3-4c56-b87b-88a2359d2285";
export const MS_CLIENT_ID  = "a5ec38cc-20b3-4c56-b87b-88a2359d2285";
```

### Enable Microsoft sign-in in Firebase

1. Firebase Console → **Authentication → Sign-in method → Microsoft** → **Enable**.
2. Paste your Azure **Application (client) ID** and **client secret**.
3. Copy the OAuth **redirect URI** Firebase shows (e.g. `https://scheduling-system-a0cf9.firebaseapp.com/__/auth/handler`) and add it to your Azure app registration under **Authentication → Redirect URIs (Web)**.
4. Add authorized domains in Firebase Auth: `localhost` and your production domain.

### Firestore

1. Firebase Console → **Firestore Database → Create database** (start in production mode).
2. Publish these starter security rules (tighten as needed):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function isSignedIn() { return request.auth != null; }
    function isAdmin() {
      return isSignedIn() && (
        request.auth.token.email == "mjfernandez@tsu.edu.ph" ||
        exists(/databases/$(db)/documents/admins/$(request.auth.token.email))
      );
    }

    match /users/{uid} {
      allow read: if isSignedIn() && (request.auth.uid == uid || isAdmin());
      allow write: if isSignedIn() && request.auth.uid == uid;
    }
    match /bookings/{id} {
      allow read: if isSignedIn() && (isAdmin() || resource.data.userId == request.auth.uid);
      allow create: if isSignedIn() && request.resource.data.userId == request.auth.uid;
      allow update, delete: if isAdmin();
    }
    match /settings/{doc} {
      allow read: if isSignedIn();
      allow write: if isAdmin();
    }
    match /admins/{email} {
      allow read: if isSignedIn();
      allow write: if isAdmin();
    }
  }
}
```

## 4. Run locally

```bash
bun dev
# or: npm run dev
```

App runs at **http://localhost:8080** (or the port Vite prints).

## 5. Build for production

```bash
bun run build
bun run preview
```

---

## Routes

| Route | Who | What |
| --- | --- | --- |
| `/login` | anyone | Microsoft sign-in |
| `/book` | student | Pick date, AM/PM slot, reason |
| `/receipt/:id` | signed-in | Printable booking receipt |
| `/admin` | admin | Dashboard (stats + recent) |
| `/admin/reports` | admin | Filter, print, CSV export |
| `/admin/add-admin` | admin | Grant admin access by email |
| `/admin/settings` | admin | Slots, reasons, unavailable dates |
| `/admin/users` | admin | Users (students / admins tabs) |

## Firestore collections

- `users/{uid}` — `{ email, displayName, role, createdAt }`
- `admins/{email}` — `{ email, addedBy, createdAt }`
- `bookings/{id}` — `{ userId, userEmail, userName, date, period, reason, createdAt }`
- `settings/config` — `{ reasons, amSlots, pmSlots, amEnabled, pmEnabled, unavailableDates }`

## Notes

- The **bootstrap admin** (`mjfernandez@tsu.edu.ph`) is auto-added to `admins` on first sign-in.
- The user you provided the same GUID for both **tenant** and **client** id. If your Azure Application (client) ID differs, update `MS_CLIENT_ID` in `src/lib/firebase.ts`.
- Receipt page uses `window.print()` — a print stylesheet hides navigation.