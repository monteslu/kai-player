# Security Model

## Overview

Loukai has **two distinct access methods** with different security models:

1. **Renderer Process (Electron UI)** - Trusted, local, no auth required
2. **Web API (HTTP/REST)** - Untrusted, network, auth required for admin

---

## Renderer Process (Trusted)

### **Access Method:**
Direct IPC communication via `window.kaiAPI.*`

### **Security Model:**
✅ **No authentication required**
✅ **Full access** to all features
✅ **File system access** allowed
✅ **Hardware access** allowed (audio devices)
✅ **Runs in same process** as main

### **Rationale:**
The Electron renderer is part of the application itself, running on the user's local machine. It's trusted by default because:
- User launched the app intentionally
- User has physical access to the computer
- Process isolation provides OS-level security

### **Available APIs:**
```javascript
// All available without auth
window.kaiAPI.player.play()
window.kaiAPI.mixer.setGain(stemId, gainDb)
window.kaiAPI.queue.addSong(queueItem)
window.kaiAPI.file.openKai()
window.kaiAPI.library.scanFolder()
// ... etc
```

---

## Web API (Untrusted)

### **Access Method:**
HTTP REST API + Socket.IO (network)

### **Security Model:**
🔒 **Authentication required** for admin endpoints
🔒 **Public endpoints** for song requests/library browsing
🔒 **Session-based auth** with encrypted cookies
🔒 **Rate limiting** (future enhancement)
🔒 **CORS protection** enabled
🔒 **No file system access**
🔒 **No hardware access**

### **Rationale:**
Web API is accessible from any device on the network (phones, tablets, other computers). Without auth:
- Malicious user on WiFi could control playback
- Prankster could skip songs, mute stems
- Audience members could hijack the queue

### **Endpoint Security:**

#### **Public Endpoints (No Auth)**
```
GET  /api/info               # Server info
GET  /api/state              # Read-only state
GET  /api/queue              # View queue
GET  /api/songs              # Browse library
POST /api/request            # Submit song requests
```

**Why public?**
- Audience needs to browse songs and submit requests
- Read-only access to queue/state is harmless
- Encourages audience participation

#### **Protected Endpoints (Auth Required)**
```
POST /admin/login            # Login (obviously no auth!)
POST /admin/logout           # Logout
GET  /admin/check-auth       # Check auth status

# Everything else under /admin/* requires auth:
POST /admin/player/*         # Playback control
POST /admin/mixer/*          # Mixer control
POST /admin/effects/*        # Effects control
POST /admin/preferences/*    # Settings
POST /admin/queue/reset      # Queue management
GET  /admin/requests         # View pending requests
POST /admin/requests/:id/*   # Approve/reject requests
```

**Why protected?**
- Only KJ/authorized operators should control these
- Prevents unauthorized playback control
- Protects mixer settings from tampering

---

## Authentication Implementation

### **Technology Stack:**
- **Session Storage:** `cookie-session` (encrypted cookies)
- **Password Hashing:** `bcrypt`
- **Password Storage:** Settings file (persistent)
- **Session Persistence:** Cookie survives server restart

### **Login Flow:**

```
┌─────────────┐
│  Web Client │
└──────┬──────┘
       │
       │ 1. POST /admin/login { password }
       ▼
┌─────────────┐
│ Web Server  │───────► Check bcrypt hash
└──────┬──────┘           against settings
       │
       │ 2. If valid: Set session cookie
       ▼
┌─────────────┐
│  Web Client │───────► Cookie stored in browser
└──────┬──────┘
       │
       │ 3. Future requests include cookie
       ▼
┌─────────────┐
│ Web Server  │───────► Middleware checks session
└──────┬──────┘
       │
       │ 4. If session.isAdmin: Allow
       │    Else: 401 Unauthorized
       ▼
```

### **Setting Admin Password:**

**In Electron App:**
1. Open Settings tab
2. Navigate to "Web Server" section
3. Enter admin password
4. Password is bcrypt hashed and saved to settings

**Via Settings File:**
```javascript
// Programmatically set password
const bcrypt = require('bcrypt');
const hash = await bcrypt.hash('your-password', 10);
await settingsManager.set('server.adminPasswordHash', hash);
```

### **Session Cookie Details:**

```javascript
{
  name: 'kai-admin-session',
  keys: [persistentSecretKey],  // 64-char hex string
  maxAge: null,                  // Session cookie (expires on browser close)
  httpOnly: true,                // Not accessible via JavaScript
  signed: true,                  // Tamper-proof
  secure: false                  // HTTP allowed (local network)
}
```

**Session Data:**
```javascript
{
  isAdmin: true,
  loginTime: 1710000000000
}
```

---

## Security Best Practices

### **✅ What's Implemented:**

1. **Separate auth domains** - Renderer (trusted) vs Web (untrusted)
2. **Strong password hashing** - bcrypt with 10 rounds
3. **Encrypted sessions** - AES-256 via `cookie-session`
4. **HttpOnly cookies** - Prevents XSS theft
5. **Signed cookies** - Prevents tampering
6. **Password persistence** - Survives app restarts
7. **Session validation** - Middleware checks all admin routes

### **🔒 Recommended (Not Yet Implemented):**

1. **Rate limiting** - Prevent brute force login attempts
   ```javascript
   const rateLimit = require('express-rate-limit');
   app.use('/admin/login', rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 5 // 5 attempts
   }));
   ```

2. **HTTPS in production** - Encrypt traffic over network
   ```javascript
   const https = require('https');
   const server = https.createServer(sslOptions, app);
   ```

3. **Session timeout** - Auto-logout after inactivity
   ```javascript
   maxAge: 24 * 60 * 60 * 1000 // 24 hours
   ```

4. **CSRF protection** - Prevent cross-site requests
   ```javascript
   const csrf = require('csurf');
   app.use(csrf({ cookie: true }));
   ```

5. **IP whitelisting** - Restrict to trusted networks
   ```javascript
   app.use('/admin/*', (req, res, next) => {
     const allowedIPs = ['192.168.1.0/24'];
     if (isAllowedIP(req.ip, allowedIPs)) next();
     else res.status(403).json({ error: 'Forbidden' });
   });
   ```

---

## Threat Model

### **Threats Mitigated:**

✅ **Unauthorized playback control** - Auth required for `/admin/*`
✅ **Session hijacking** - Signed, encrypted cookies
✅ **Password sniffing** - Bcrypt one-way hash
✅ **Cookie tampering** - HMAC signature validation
✅ **Replay attacks** - Session expiry (browser close)

### **Threats NOT Mitigated:**

⚠️ **Man-in-the-middle** - HTTP traffic not encrypted (use HTTPS)
⚠️ **Brute force** - No rate limiting on login
⚠️ **Shoulder surfing** - User must protect password
⚠️ **Local access** - Anyone with physical access can use Electron UI
⚠️ **Session fixation** - Session ID not rotated on login

### **Risk Assessment:**

**Low Risk Environment** (Home karaoke night with friends):
- Current implementation is adequate
- Everyone on WiFi is trusted
- HTTP is acceptable

**Medium Risk Environment** (Small venue, public WiFi):
- Add rate limiting
- Consider HTTPS
- Use strong admin password

**High Risk Environment** (Large venue, untrusted network):
- Implement all recommended security measures
- Use HTTPS with valid certificate
- Consider VPN or isolated network
- Enable IP whitelisting

---

## Comparison to Similar Systems

### **Karaoke Cloud/Karafun:**
- SaaS model, auth via OAuth
- Full HTTPS, enterprise security
- Multi-user accounts with roles

**Loukai Approach:**
- Self-hosted, single admin password
- Simpler deployment, local control
- Suitable for single-operator or small venue

### **Plex Media Server:**
- User accounts with libraries
- Remote access via plex.tv relay
- Complex permission system

**Loukai Approach:**
- Single admin, public requests
- Local network only
- Simpler for karaoke use case

---

## Future Enhancements

### **Phase 1: Essential Security**
- ✅ Session-based auth (done)
- 🔲 Rate limiting on login
- 🔲 Session timeout after inactivity
- 🔲 HTTPS support

### **Phase 2: Multi-User**
- 🔲 User accounts (KJ, Assistant, Singer)
- 🔲 Role-based permissions
- 🔲 Audit log of actions

### **Phase 3: Enterprise**
- 🔲 OAuth/SAML integration
- 🔲 IP whitelisting
- 🔲 CSRF protection
- 🔲 2FA support

---

## Security Testing

### **Manual Testing:**

```bash
# Test public endpoint (no auth)
curl http://localhost:3000/api/queue

# Test protected endpoint without auth (should fail)
curl http://localhost:3000/admin/player/play
→ {"error":"Unauthorized"}

# Login
curl -c cookies.txt -X POST http://localhost:3000/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password":"test"}'

# Test protected endpoint with session cookie (should work)
curl -b cookies.txt -X POST http://localhost:3000/admin/player/play
→ {"success":true}

# Logout
curl -b cookies.txt -X POST http://localhost:3000/admin/logout

# Test after logout (should fail)
curl -b cookies.txt -X POST http://localhost:3000/admin/player/play
→ {"error":"Unauthorized"}
```

### **Automated Testing:**

```javascript
// Jest test example
describe('API Authentication', () => {
  it('should reject admin endpoints without auth', async () => {
    const res = await request(app).post('/admin/player/play');
    expect(res.status).toBe(401);
  });

  it('should accept admin endpoints with valid session', async () => {
    const loginRes = await request(app)
      .post('/admin/login')
      .send({ password: 'test' });

    const cookie = loginRes.headers['set-cookie'];

    const res = await request(app)
      .post('/admin/player/play')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
  });
});
```

---

## Conclusion

Loukai implements a **pragmatic security model**:

- **Renderer:** Trusted local access, no auth friction
- **Web API:** Untrusted network access, session-based auth
- **Balance:** Security without compromising UX

This model is appropriate for:
✅ Home karaoke setups
✅ Small venue operation
✅ Local network deployments

For production/enterprise use, implement the recommended enhancements (HTTPS, rate limiting, etc.).