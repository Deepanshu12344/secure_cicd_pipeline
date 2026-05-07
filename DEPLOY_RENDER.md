# Deploy Publicly on Render

## 1) Push this repo to GitHub

Render Blueprints deploy from a Git repo. Push these files first, including `render.yaml`.

## 2) Create a Blueprint in Render

1. Open Render Dashboard.
2. Click `New` -> `Blueprint`.
3. Select this repository and branch.
4. Confirm the `render.yaml` at repo root.
5. Click `Apply`.

This will create:
- `secure-cicd-frontend` (public web service)
- `secure-cicd-backend` (public web service)
- `secure-cicd-ml-engine` (private service)
- `secure-cicd-mongo` (private service with persistent disk)

## 3) Wait for all services to be healthy

Once deployed:
- Frontend URL: `https://secure-cicd-frontend.onrender.com`
- Backend health: `https://secure-cicd-backend.onrender.com/health`

## 4) If CORS blocks login/API calls

In `secure-cicd-backend` environment variables, set:
- `FRONTEND_URL=https://secure-cicd-frontend.onrender.com`

Then redeploy backend.

## Notes

- Initial build can take several minutes (ML image dependencies are heavy).
- Mongo runs as a private Docker service on Render with a persistent disk mounted at `/data/db`.
