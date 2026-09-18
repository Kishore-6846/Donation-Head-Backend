# Donation Head & Receipt - Backend API

Robust Node.js & Express REST API engine powering NGO Donation Receipts and SuperAdmin/Trust Admin management with MongoDB integration and resilient fallback storage.

## 🚀 Features

- **Authentication & Roles**: SuperAdmin and Trust Admin role management with JWT and Bcrypt encryption.
- **Donation Heads Engine**:
  - Global categories auto-propagated across all trusts.
  - Trust-scoped categories auto-tagged with `(Trust Name)`.
  - Scoped deletion (hides only for the deleting trust) vs. SuperAdmin permanent global deletion.
- **Donation Receipts**: Receipt number generator with prefixing, 80G eligibility, automated words-from-numbers conversion.
- **Reporting**: Form No. 10BD, Head-Wise, Payment Mode, and Financial Year aggregates.
- **Resilient Storage**: MongoDB Atlas with automatic fallback JSON storage (`services/storageService.js`) ensuring high availability.

## 🛠️ Technology Stack

- **Node.js** & **Express**
- **MongoDB** & **Mongoose**
- **JSON Web Token (JWT)** & **Bcrypt.js**
- **PDFKit** & **Archiver** (PDF receipts & ZIP export)

## 📦 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root of this folder (or copy `.env.example`):
```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key
NODE_ENV=development
```

### 3. Start the Server
- **Production / Standard mode**:
  ```bash
  npm start
  ```
- **Development mode (with nodemon)**:
  ```bash
  npm run dev
  ```
The server will run at `http://localhost:5000`.
