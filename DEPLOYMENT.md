# Vercel Deployment Guide

## Prerequisites

1. Install Vercel CLI (optional, but recommended):
```bash
npm install -g vercel
```

2. Create a Vercel account at https://vercel.com

## Deployment Steps

### Option 1: Deploy via Vercel CLI (Recommended)

1. **Login to Vercel**:
```bash
vercel login
```

2. **Deploy to Vercel**:
```bash
vercel
```

3. **Follow the prompts**:
   - Set up and deploy? **Y**
   - Which scope? Select your account
   - Link to existing project? **N** (first time)
   - What's your project's name? **whois-api** (or your choice)
   - In which directory is your code located? **./** (press Enter)
   - Want to override the settings? **N**

4. **Deploy to production**:
```bash
vercel --prod
```

### Option 2: Deploy via GitHub (Easier for continuous deployment)

1. **Initialize Git** (if not already done):
```bash
git init
git add .
git commit -m "Initial commit"
```

2. **Create a GitHub repository** and push your code:
```bash
git remote add origin https://github.com/YOUR_USERNAME/whois-api.git
git branch -M main
git push -u origin main
```

3. **Connect to Vercel**:
   - Go to https://vercel.com/new
   - Import your GitHub repository
   - Vercel will auto-detect the settings
   - Click **Deploy**

## Environment Variables

After deployment, you need to set environment variables in Vercel:

1. Go to your project dashboard on Vercel
2. Click **Settings** → **Environment Variables**
3. Add these variables:
   - `PORT` = `3001` (optional, Vercel handles this)
   - `CORS_ORIGIN` = `*` (or your React app URL for production)
   - `NODE_ENV` = `production`

## Testing Your Deployment

Once deployed, Vercel will give you a URL like:
```
https://whois-api-xxx.vercel.app
```

Test your endpoints:
```bash
# Health check
curl https://whois-api-xxx.vercel.app/api/health

# WHOIS lookup
curl https://whois-api-xxx.vercel.app/api/whois/google.com
```

## Update Your React App

Update your React app to use the Vercel URL:

```javascript
// Before (local)
const API_URL = 'http://localhost:3002';

// After (production)
const API_URL = 'https://whois-api-xxx.vercel.app';

// Best practice (environment-based)
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3002';
```

## Important Notes

### 1. **Serverless Function Timeout**
- Vercel free tier has a 10-second timeout for serverless functions
- WHOIS lookups should complete within this time
- If you get timeouts, consider upgrading to Pro plan (60-second timeout)

### 2. **Cold Starts**
- First request after inactivity may be slower (cold start)
- Subsequent requests will be faster

### 3. **CORS Configuration**
- Update `CORS_ORIGIN` environment variable to your React app's domain
- Example: `https://your-react-app.vercel.app`

### 4. **Rate Limiting**
- Consider adding rate limiting for production
- Vercel has built-in DDoS protection

## Continuous Deployment

If you used GitHub integration:
- Every push to `main` branch auto-deploys to production
- Pull requests create preview deployments
- Easy rollbacks from Vercel dashboard

## Monitoring

View logs and analytics:
1. Go to your project on Vercel
2. Click **Deployments** to see deployment history
3. Click **Logs** to see function execution logs
4. Click **Analytics** to see usage stats

## Troubleshooting

### Issue: "Module not found"
**Solution**: Make sure all dependencies are in `package.json`, not just devDependencies

### Issue: "Function timeout"
**Solution**: 
- Check if WHOIS server is responding slowly
- Consider caching results
- Upgrade to Vercel Pro for longer timeout

### Issue: "CORS errors"
**Solution**: Update `CORS_ORIGIN` environment variable in Vercel settings

## Local Testing with Production Mode

Test the production build locally:
```bash
NODE_ENV=production node server.js
```

This won't start the server (as expected for Vercel), but you can test with:
```bash
vercel dev
```

This runs a local Vercel development server.

## Custom Domain (Optional)

1. Go to your project settings on Vercel
2. Click **Domains**
3. Add your custom domain
4. Follow DNS configuration instructions

Your API will be available at: `https://api.yourdomain.com`

## Next Steps

1. Deploy to Vercel
2. Test all endpoints
3. Update React app with production URL
4. Set up custom domain (optional)
5. Monitor usage and logs

Happy deploying! 🚀
