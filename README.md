<div align="center">

# 🎓 SB-CSE-GNITC Placement Portal

### _Elite League Placement Management System_

[![Angular](https://img.shields.io/badge/Angular-17-DD0031?style=for-the-badge&logo=angular&logoColor=white)](https://angular.io/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://mongodb.com/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

---

_A premium, full-stack placement management application designed exclusively for the Special Batch students of GNITC. Connecting elite talent with top-tier opportunities through a seamless verification-based workflow._

**Developed by [Sonathi Tharun Kumar](https://github.com/SonathiTharun)**

</div>

---

## 🏗️ System Architecture

The application follows a modern **MEAN Stack** (MongoDB, Express, Angular, Node.js) architecture with a robust REST API and responsive client-side rendering.

```mermaid
graph TD
    Client[💻 Angular Client]
    Server[🚀 Node.js/Express Server]
    DB[(🍃 MongoDB Atlas)]
    Auth[🔐 Auth Layer]
    Ext[☁️ Cloudinary/Email Service]

    Client <-->|REST API JSON| Server
    Server <-->|Mongoose ODM| DB
    Server -->|Session/Cookies| Auth
    Server -->|Uploads/SMTP| Ext

    subgraph Frontend
    Client
    end

    subgraph Backend
    Server
    DB
    Auth
    end
```

---

## � Core Workflows

### 1. Placement Submission & Verification Flow

Every student submission goes through a rigorous verification process to ensure data integrity.

```mermaid
sequenceDiagram
    participant Student
    participant Portal
    participant Admin
    participant Email

    Student->>Portal: � Submit Placement Details
    Portal->>Admin: 🔔 Notify New Submission
    Note over Portal, Admin: Status: PENDING
    Admin->>Portal: 👀 Review Submission
    alt Accepted
        Admin->>Portal: ✅ Verify
        Portal->>Email: 📧 Send Verification Success Email
        Note over Portal, Admin: Status: VERIFIED
    else Rejected
        Admin->>Portal: ❌ Reject
        Portal->>Email: � Send Rejection Email
        Note over Portal, Admin: Status: REJECTED
    end
```

### 2. Placement Editing & Re-Verification

To prevent data tampering, editing any placement (even verified ones) automatically triggers a re-verification cycle.

```mermaid
stateDiagram-v2
    [*] --> Submitted
    Submitted --> Pending: Initial
    Pending --> Verified: Admin Appoves
    Pending --> Rejected: Admin Rejects

    Verified --> Pending: ⚠️ Student Edits
    Rejected --> Pending: ✏️ Student Edits

    note right of Verified
        Editing a verified placement
        resets status to PENDING
        for re-verification.
    end note
```

---

## ✨ Key Features

### 🛡️ Admin Dashboard (Command Center)

- **Real-time Analytics**: Visual charts (Trend, Donut, Bar) using ApexCharts.
- **Verification Hub**: Approve or reject placements with a single click.
- **Bulk Reminders**: Send email reminders to students with pending submissions.
  - _Target Selection_: Send to "Pending Only" or "All Students".
  - _Credentials Included_: Emails auto-include User ID & Password.
- **Reports**: Export verified data to Excel (`.xlsx`) and Word (`.doc`) with company logos.
- **Notification System**: Real-time bell notifications with sound alerts.

### 👨‍🎓 Student Portal

- **One-Click Submission**: Easy form for submitting internship/job offers.
- **Edit Capabilities**:
  - Edit any placement (Verified/Pending/Rejected).
  - Update profile photo directly from the edit modal.
  - _Security Check_: Edits trigger re-verification.
- **Duplicate Prevention**: Smart checks prevent submitting the same company twice.
- **Status Tracking**: Visual badges (Pending/Verified/Rejected) for all submissions.

---

## 🔐 Security & Reliability

| Feature            | Implementation             | Purpose                         |
| :----------------- | :------------------------- | :------------------------------ |
| **Authentication** | `bcrypt` + Session Cookies | Secure login & state management |
| **Access Control** | Role-based Middleware      | Separate Admin/Student routes   |
| **Data Integrity** | Mongoose Schemas           | Strict typing & validation      |
| **File Security**  | Cloudinary / Local Storage | Secure image handling           |
| **Audit Logging**  | Activity Logger            | Tracks all critical actions     |

---

## 🚀 Quick Start

### Prerequisites

- Node.js v18+
- MongoDB Atlas URI
- Cloudinary Account (for images)
- Gmail App Password (for emails)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/SonathiTharun/SB-CSE-GNITC.git
cd SB-CSE-GNITC

# 2. Install backend dependencies
npm install

# 3. Install frontend dependencies
cd client
npm install
cd ..

# 4. Configure Environment
# Create .env file in root directory
PORT=3000
MONGODB_URI=your_mongodb_uri
SESSION_SECRET=your_secret_key
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
CLOUDINARY_URL=cloudinary://key:secret@cloud

# 5. Start Development Servers
# Backend
node server.js

# Frontend (in new terminal)
cd client
ng serve
```

---

## � API Documentation

### Public Routes

- `POST /api/login` - Authenticate user
- `POST /api/logout` - Destroy session

### Student Routes (Protected)

- `GET /api/placements/my` - Get logged-in student's placements
- `POST /api/placements` - Submit new placement
- `PUT /api/placements/:id` - Edit placement (Resets to Pending)
- `POST /api/upload-photo` - Upload profile picture

### Admin Routes (Protected)

- `GET /api/admin/detailed-placements` - Get all records
- `POST /api/admin/verify` - Approve/Reject placement
- `POST /api/admin/send-pending-reminders` - Bulk email reminders

---

## 📁 Project Structure

```
SB-CSE-GNITC/
├── 📄 server.js              # 🚀 Main Express Application
├── 📁 client/                # 💻 Angular 17 Frontend
│   ├── 📁 src/app/features/  # Feature Modules
│   │   ├── 📁 admin/         # Dashboard & Reports
│   │   ├── 📁 student/       # Student Portal
│   │   └── 📁 auth/          # Login System
│   └── 📁 src/app/core/      # Services & Guards
├── 📁 logos/                 # 🖼️ Company Assets
└── 📄 package.json           # Dependecies
```

---

## 📧 Contact & Support

**Sonathi Tharun Kumar**  
_CSE Department, GNITC_  
📧 Email: tharunsonathi@gmail.com

---

<div align="center">

**⭐ Star this repository if you find it useful!**

</div>
