# URGENT: Security Key Rotation Guide

Your API keys were exposed in the public GitHub repository. Follow these steps **IMMEDIATELY**.

---

## 1. Regenerate Firebase API Key (REQUIRED)

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials?project=studio-1083756985-9d2c6)
2. Find the exposed API key: `AIzaSyAJeWxw_YF2ooBqxL7J0knpqatSeC2qXyE`
3. Click the key → **Regenerate Key**
4. Copy the new key
5. Update your local `apphosting.yaml`:
   ```yaml
   - variable: NEXT_PUBLIC_FIREBASE_API_KEY
     value: YOUR_NEW_KEY_HERE
   ```

### Add API Key Restrictions (IMPORTANT)

After regenerating, restrict the key:

1. Click the API key in Cloud Console
2. Under **Application restrictions**:
   - Select "HTTP referrers (websites)"
   - Add allowed domains:
     - `https://kanteen-mrc-live.web.app/*`
     - `https://studio--studio-1083756985-9d2c6.us-central1.hosted.app/*`
     - `http://localhost:3000/*` (for development)
3. Under **API restrictions**:
   - Select "Restrict key"
   - Enable only:
     - Firebase Auth API
     - Cloud Firestore API
     - Identity Toolkit API
4. Click **Save**

---

## 2. Regenerate Razorpay Keys (CRITICAL - MONEY AT RISK)

**This is the most critical step - your live payment keys are exposed!**

1. Go to [Razorpay Dashboard](https://dashboard.razorpay.com/app/keys)
2. Click **Regenerate Key** for the live key
3. **Immediately update** your local `apphosting.yaml`
4. Use Firebase App Hosting secrets for the secret key:

```bash
# Set the secret securely (prompts for value)
firebase apphosting:secrets:set RAZORPAY_KEY_SECRET

# Set webhook secret
firebase apphosting:secrets:set RAZORPAY_WEBHOOK_SECRET
```

Then update `apphosting.yaml` to use secrets:
```yaml
- variable: RAZORPAY_KEY_SECRET
  secret: RAZORPAY_KEY_SECRET

- variable: RAZORPAY_WEBHOOK_SECRET
  secret: RAZORPAY_WEBHOOK_SECRET
```

---

## 3. Deploy with New Keys

```bash
# Commit the security fix (apphosting.yaml is now gitignored)
git add .gitignore apphosting.yaml.example docs/SECURITY_KEY_ROTATION.md
git commit -m "security: Remove exposed keys, add gitignore for apphosting.yaml"
git push origin main
```

Firebase App Hosting will auto-deploy, but you may need to manually trigger if secrets changed:

```bash
firebase apphosting:backends:create  # or update existing
```

---

## 4. Verify No Unauthorized Usage

### Check Firebase Usage
1. Go to [Firebase Console](https://console.firebase.google.com/project/studio-1083756985-9d2c6)
2. Check **Usage and billing**
3. Look for unusual spikes

### Check Razorpay Dashboard
1. Go to [Razorpay Dashboard](https://dashboard.razorpay.com)
2. Check **Transactions** for any unauthorized payments
3. Check **Refunds** for any suspicious activity

### Check Cloud Console Logs
```bash
gcloud logging read "resource.type=api AND protoPayload.authenticationInfo.principalEmail!=YOUR_EMAIL" --limit=100
```

---

## 5. Purge from Git History (OPTIONAL but Recommended)

The keys are still in git history. To fully remove them:

```bash
# Install BFG Repo-Cleaner
# https://rtyley.github.io/bfg-repo-cleaner/

# Create a file with secrets to remove
echo "AIzaSyAJeWxw_YF2ooBqxL7J0knpqatSeC2qXyE" > secrets.txt
echo "0SuTUugY3y6t5555So36pszc" >> secrets.txt
echo "rzp_live_SAc1p3xOybLPWa" >> secrets.txt

# Run BFG to remove secrets from history
bfg --replace-text secrets.txt

# Force push (DANGER - coordinate with team)
git reflog expire --expire=now --all && git gc --prune=now --aggressive
git push --force
```

**Warning:** Force pushing rewrites history. Coordinate with any collaborators.

---

## 6. Prevention Checklist

- [x] Add `apphosting.yaml` to `.gitignore`
- [x] Create `apphosting.yaml.example` as template
- [ ] Regenerate Firebase API key
- [ ] Add API key restrictions in Google Cloud
- [ ] Regenerate Razorpay keys
- [ ] Use Firebase secrets for sensitive values
- [ ] Verify no unauthorized usage
- [ ] Consider purging git history

---

## Quick Reference: New Key Locations

| Key | Where to Update |
|-----|-----------------|
| Firebase API Key | `apphosting.yaml` → `NEXT_PUBLIC_FIREBASE_API_KEY` |
| Razorpay Key ID | `apphosting.yaml` → `RAZORPAY_KEY_ID` and `NEXT_PUBLIC_RAZORPAY_KEY_ID` |
| Razorpay Secret | Firebase Secrets → `RAZORPAY_KEY_SECRET` |
| Webhook Secret | Firebase Secrets → `RAZORPAY_WEBHOOK_SECRET` |

---

## Support

- **Firebase:** https://firebase.google.com/support
- **Razorpay:** support@razorpay.com
- **Google Cloud Security:** https://cloud.google.com/security
