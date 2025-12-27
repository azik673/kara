# Deploying Atelier AI to Vercel

You can deploy this application to Vercel for free in just a few minutes.

## Option 1: Using the Vercel CLI (Recommended)

1.  **Install Vercel CLI** (if you haven't already):
    ```bash
    npm i -g vercel
    ```

2.  **Login to Vercel**:
    ```bash
    vercel login
    ```

3.  **Deploy**:
    Run the following command in the project root folder:
    ```bash
    vercel
    ```
    -   Follow the prompts (say "Y" to set up, keep default settings).
    -   It will give you a "Preview" URL.

4.  **Deploy to Production**:
    Once you are happy with the preview, run:
    ```bash
    vercel --prod
    ```
    This will give you your final, live URL.

## Option 2: Using Git (GitHub/GitLab/Bitbucket)

1.  **Push your code** to a repository on GitHub, GitLab, or Bitbucket.
2.  **Go to [Vercel.com](https://vercel.com)** and log in.
3.  Click **"Add New..."** -> **"Project"**.
4.  **Import** your repository.
5.  **Framework Preset**: Vercel should automatically detect **Vite**. If not, select it.
6.  **Environment Variables**:
    -   If you are using the Gemini API, make sure to add your `GEMINI_API_KEY` in the **Environment Variables** section during deployment.
7.  Click **Deploy**.

## Important Notes

-   **Routing**: A `vercel.json` file has been included to ensure that refreshing the page works correctly (SPA Routing).
-   **Environment Variables**: Never commit your `.env` file containing real API keys. Always set them in the Vercel dashboard.
