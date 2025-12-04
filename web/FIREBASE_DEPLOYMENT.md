# Firebase Hosting Deployment Guide

This guide explains how to deploy the Next.js application as a static site to Firebase Hosting.

## Prerequisites

1. Install Firebase CLI:
```bash
npm install -g firebase-tools
```

2. Login to Firebase:
```bash
firebase login
```

## Configuration

The project is configured for static export with:
- `next.config.ts`: Contains `output: 'export'` for static HTML generation
- `firebase.json`: Firebase Hosting configuration pointing to the `out` directory
- `package.json`: Contains `export` script for building static files

## Deployment Steps

### 1. Build the Static Export

```bash
npm run export
```

This will create an `out` directory with all static HTML, CSS, and JavaScript files.

### 2. Initialize Firebase (First Time Only)

If you haven't initialized Firebase in this project yet:

```bash
firebase init hosting
```

When prompted:
- Select your Firebase project or create a new one
- Set public directory to: `out`
- Configure as single-page app: `Yes`
- Set up automatic builds with GitHub: `No` (optional)
- Don't overwrite `out/index.html` if asked

### 3. Deploy to Firebase

```bash
firebase deploy --only hosting
```

Or use the shorthand:
```bash
firebase deploy
```

### 4. View Your Deployed Site

After deployment, Firebase will provide you with a URL like:
```
https://your-project-id.web.app
```

## Environment Variables

For production deployment, make sure to set up environment variables in your Firebase project or use a `.env.production` file that gets included in the build.

## Continuous Deployment

You can set up GitHub Actions or Firebase Hosting's built-in GitHub integration for automatic deployments on push to main branch.

## Troubleshooting

### Build Errors
- Make sure all dependencies are installed: `npm install`
- Check that there are no TypeScript errors: `npm run lint`

### Routing Issues
- The `firebase.json` is configured with rewrites to handle client-side routing
- All routes will fall back to `index.html` for proper SPA behavior

### Cache Issues
- Static assets are cached for 1 year (31536000 seconds)
- To force refresh, you can version your assets or clear the Firebase Hosting cache
