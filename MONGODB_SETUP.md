# MongoDB Installation Guide

## Option 1: MongoDB Atlas (Cloud - Recommended for Development) ⭐

**Easiest option - No local installation required!**

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)
2. Sign up for a free account
3. Create a free cluster (M0 - Free tier)
4. Create a database user
5. Whitelist your IP address (or use 0.0.0.0/0 for development)
6. Get your connection string
7. Update `.env` file:
   ```env
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/payment-backend
   ```

**Pros:**
- ✅ No installation needed
- ✅ Free tier available
- ✅ Works immediately
- ✅ Accessible from anywhere

---

## Option 2: Local MongoDB Installation (Windows)

### Step 1: Download MongoDB Community Server
1. Visit: https://www.mongodb.com/try/download/community
2. Select:
   - Version: Latest (7.0+)
   - Platform: Windows
   - Package: MSI
3. Click "Download"

### Step 2: Install MongoDB
1. Run the downloaded `.msi` installer
2. Choose "Complete" installation
3. Select "Install MongoDB as a Service"
4. Choose "Run service as Network Service user"
5. Install MongoDB Compass (GUI tool) - recommended
6. Click "Install"

### Step 3: Verify Installation
Open a new terminal and run:
```bash
mongod --version
mongosh --version
```

### Step 4: Start MongoDB Service
MongoDB should start automatically as a Windows service. If not:
1. Open Services (Win + R, type `services.msc`)
2. Find "MongoDB" service
3. Right-click → Start

### Step 5: Update .env
Your `.env` already has:
```env
MONGODB_URI=mongodb://localhost:27017/payment-backend
```

This should work now!

---

## Option 3: Using Docker (If Docker Desktop is installed)

1. Install Docker Desktop for Windows: https://www.docker.com/products/docker-desktop
2. Run MongoDB container:
   ```bash
   docker run -d -p 27017:27017 --name mongodb mongo:latest
   ```
3. Your `.env` connection string will work:
   ```env
   MONGODB_URI=mongodb://localhost:27017/payment-backend
   ```

---

## Option 4: Using Chocolatey Package Manager

If you have Chocolatey installed:

```bash
choco install mongodb
```

Then start the service:
```bash
net start MongoDB
```

---

## Quick Test After Installation

Once MongoDB is installed and running, test the connection:

```bash
# Start your Node.js server
npm run dev
```

You should see: `MongoDB connected successfully`

---

## Troubleshooting

### MongoDB service won't start
- Check if port 27017 is already in use
- Run Command Prompt as Administrator
- Check Windows Event Viewer for errors

### Connection refused
- Ensure MongoDB service is running
- Check firewall settings
- Verify connection string in `.env`

### For MongoDB Atlas
- Ensure IP is whitelisted
- Check username/password are correct
- Verify connection string format

---

## Recommended: MongoDB Atlas for Development

For quick setup, we recommend **MongoDB Atlas** (Option 1) as it:
- Requires no installation
- Works immediately
- Has a free tier
- Can be accessed from anywhere
- Easy to share with team members

