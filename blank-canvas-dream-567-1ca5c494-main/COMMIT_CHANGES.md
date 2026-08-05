# Commit Instructions

Execute these commands in the project directory:

```bash
git add .
git commit -m "Remove debug logs and add error handling to diagnosis-image-search

- Removed console.log statements that might cause 500 errors
- Added try-catch block to buildQueryFromDiagnosis
- Added fallback query in case of errors
- SmartSectionImage logs removed to prevent errors
- Scope category fallback to capsula section only

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
git push
```

## Deploy Steps:

1. Commit the changes locally
2. Push to git
3. Vercel will auto-deploy

## Supabase Edge Function Deploy:

After frontend deploy, also deploy the edge function:
1. Supabase Dashboard → Edge Functions → diagnosis-image-search
2. Edit → Copy `supabase/functions/diagnosis-image-search/index.ts`
3. Cole → Deploy

## What This Fixes:

The edge function was returning 500 errors. Now:
1. Removed debug logs that might be causing the error
2. Added try-catch error handling to buildQueryFromDiagnosis
3. Added fallback query in case of errors
4. This should prevent 500 errors and allow images to load
