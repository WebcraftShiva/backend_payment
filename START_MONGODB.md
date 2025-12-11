# How to Start MongoDB on Windows

## Option 1: Start MongoDB as a Windows Service (Recommended)

1. **Open Services Manager:**
   - Press `Win + R`
   - Type `services.msc` and press Enter

2. **Find MongoDB Service:**
   - Look for "MongoDB" or "MongoDB Server" in the list
   - Right-click on it
   - Click "Start"

3. **Set to Auto-start (Optional):**
   - Right-click on MongoDB service
   - Select "Properties"
   - Set "Startup type" to "Automatic"
   - Click "OK"

## Option 2: Start MongoDB Manually

1. **Open Command Prompt or PowerShell as Administrator**

2. **Navigate to MongoDB bin directory** (usually):
   ```bash
   cd "C:\Program Files\MongoDB\Server\7.0\bin"
   ```
   (Replace 7.0 with your MongoDB version)

3. **Start MongoDB:**
   ```bash
   mongod --dbpath "C:\data\db"
   ```
   
   **Note:** If the `C:\data\db` folder doesn't exist, create it first:
   ```bash
   mkdir C:\data\db
   ```

4. **Keep the terminal window open** - MongoDB will run in this window

## Option 3: Install MongoDB as a Service (If not installed)

If MongoDB is installed but not running as a service:

1. **Open Command Prompt as Administrator**

2. **Navigate to MongoDB bin directory:**
   ```bash
   cd "C:\Program Files\MongoDB\Server\7.0\bin"
   ```

3. **Install MongoDB as a service:**
   ```bash
   mongod --install --serviceName "MongoDB" --serviceDisplayName "MongoDB" --dbpath "C:\data\db"
   ```

4. **Start the service:**
   ```bash
   net start MongoDB
   ```

## Verify MongoDB is Running

After starting MongoDB, test the connection:

```bash
node scripts/testMongoConnection.js
```

Or check if MongoDB is listening on port 27017:

```bash
netstat -an | findstr 27017
```

## Quick Start Your Server

Once MongoDB is running, start your server:

```bash
npm start
```

Or for development:

```bash
npm run dev
```

You should see:
```
✅ MongoDB connected successfully!
📊 Database: payment-backend
💾 Data will be saved to MongoDB
```

## Troubleshooting

### Error: "Cannot connect to MongoDB"
- Make sure MongoDB service is running
- Check if port 27017 is not blocked by firewall
- Verify MongoDB is installed correctly

### Error: "Access Denied"
- Run Command Prompt as Administrator
- Check MongoDB service permissions

### MongoDB Not Found
- Make sure MongoDB is installed
- Add MongoDB bin directory to your PATH environment variable
- Default location: `C:\Program Files\MongoDB\Server\7.0\bin`

