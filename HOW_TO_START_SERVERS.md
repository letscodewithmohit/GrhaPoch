# 🚀 How to Start Your Servers

## ✅ EASY WAY (Recommended)

### To START servers:
1. Double-click `START_SERVERS.bat` in the project root folder
2. Two command windows will open (one for backend, one for frontend)
3. Wait 10 seconds for both to start
4. Open browser: http://localhost:5173

### To STOP servers:
1. Double-click `STOP_SERVERS.bat` in the project root folder
2. All servers will be stopped

---

## ⚠️ IMPORTANT RULES

### ❌ DON'T DO THIS:
- **DON'T** run `npm run dev` multiple times
- **DON'T** open multiple terminals and start servers
- **DON'T** start backend twice

### ✅ DO THIS:
- **ALWAYS** use `STOP_SERVERS.bat` first if you get port errors
- **THEN** use `START_SERVERS.bat` to restart
- Keep the two command windows open while working

---

## 🔍 How to Check if Servers are Running

### Backend (Port 5000):
Open browser: http://localhost:5000/api
- If you see a JSON response, backend is running ✅

### Frontend (Port 5173):
Open browser: http://localhost:5173
- If you see your app, frontend is running ✅

---

## 🐛 If You Get "Port Already in Use" Error

1. Run `STOP_SERVERS.bat`
2. Wait 5 seconds
3. Run `START_SERVERS.bat`
4. Done!

---

## 📝 Current Status

✅ Backend: http://localhost:5000
✅ Frontend: http://localhost:5173

Both servers are currently RUNNING!
