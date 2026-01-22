# Smart Parking System

A full-stack web application for managing parking lots, reservations, and payments. Built as a Database Course final project demonstrating relational database design and CRUD operations using Node.js, Express, and MySQL/MariaDB.

![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-4479A1?style=flat&logo=mysql&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=flat&logo=express&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)

## ✨ Features

- **User Authentication** - Secure registration & login with bcrypt password hashing
- **Vehicle Management** - Add, view, and delete vehicles linked to your account
- **Interactive Parking Map** - Visual spot selection with real-time availability
- **Smart Reservations** - One active session per driver, prevents double-booking
- **Automated Fee Calculation** - Entry fee + hourly rate after first hour
- **Payment System** - Save credit cards and pay parking fees
- **Parking History** - View all past sessions with status tracking

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | HTML, CSS, JavaScript, Leaflet.js (maps) |
| Backend | Node.js, Express.js |
| Database | MariaDB / MySQL |
| Auth | bcrypt.js |

## 📊 Database Schema

- **driver** - User accounts
- **vehicle** - Cars linked to drivers
- **parking_lot** - Lot info with pricing
- **camera** - One camera per lot (1:1 relationship)
- **log** - Parking sessions (ACTIVE → UNPAID → PAID)
- **credit_card** - Saved payment methods
- **payment** - Payment records

### Key Constraints
- Foreign keys with CASCADE updates
- Triggers to enforce one active session per driver
- Triggers to block reservations if unpaid fees exist

## 🚀 Getting Started

### Prerequisites
- Node.js (v14+)
- MariaDB or MySQL

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/smart-parking.git
   cd smart-parking
   ```

2. **Set up the database**
   - Open `sql/smart_parking.sql` in HeidiSQL or MySQL Workbench
   - Run the entire script to create tables and seed data

3. **Configure environment**
   ```bash
   cd backend
   # Edit .env file with your database credentials
   ```

4. **Install dependencies**
   ```bash
   npm install
   ```

5. **Start the server**
   ```bash
   npm start
   ```

6. **Open the app**
   - Navigate to `http://localhost:3000`
   - Login with test account: `reina.nizam@test.com` / `1234`

## 📁 Project Structure

```
smart-parking/
├── backend/
│   ├── server.js      # Express server & API routes
│   ├── db.js          # Database connection
│   ├── .env           # Environment variables
│   └── package.json
├── frontend/
│   ├── index.html     # Main HTML file
│   └── assets/
│       ├── styles.css
│       └── app.js
├── sql/
│   ├── smart_parking.sql    # Main schema + seed data
│   └── complex_queries.sql  # Example queries
└── README.md
```

🔑 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login |
| GET | `/vehicle/:driverId` | Get user's vehicles |
| POST | `/vehicle/add` | Add vehicle |
| GET | `/lots/nearby` | Get all parking lots |
| POST | `/session/start` | Start parking session |
| POST | `/session/end` | End session & calculate fee |
| GET | `/logs/driver/:id` | Get parking history |
| POST | `/payment/pay` | Pay for a session |



This project is for educational purposes - Database Course Final Project.

