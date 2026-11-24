# Kofemaster MAX Publisher

A minimal Vercel serverless endpoint for publishing text posts to a MAX channel.

## Important security notes

- Do not commit `.env` files or put bot tokens in source code.
- The MAX bot token previously pasted into a chat should be revoked/rotated in MAX for Business before deployment.
- The bot must be an administrator of the target channel and have permission to publish/write posts.

## Deploy

1. Create a new **private** GitHub repository named `kofemaster-max-publisher`.
2. Upload the contents of this folder to the repository root (the `api` folder must be at the root).
3. In Vercel, create a project by importing that GitHub repository.
4. In Vercel Project Settings -> Environment Variables, add:
   - `MAX_BOT_TOKEN`: the newly rotated bot token
   - `MAX_CHANNEL_ID`: numeric/string channel chat ID provided by MAX
   - `PUBLISHER_SECRET`: a long random secret used to protect this endpoint
5. Redeploy after adding variables.

## Test

Health check:

`GET https://YOUR-VERCEL-DOMAIN/api/publish`

Publish a post:

```bash
curl -X POST 'https://YOUR-VERCEL-DOMAIN/api/publish' \
  -H 'Content-Type: application/json' \
  -H 'x-publisher-secret: YOUR_PUBLISHER_SECRET' \
  -d '{"text":"Проверочная публикация от Кофе Мастер Про."}'
```

The endpoint accepts text only in this first version. Image upload and scheduled publishing are not included yet. MAX API documentation: https://dev.max.ru/docs-api/
