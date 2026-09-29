# Local Places Finder (GitHub Pages edition)

A static browser app for searching Google Places by business type and location. Each person enters their own Google Maps Platform API key. No key is included in the repository or ZIP, and the app has no application server: Places API requests go directly from that person's browser to Google. The key stays in JavaScript memory in the current tab only; refreshing or closing the tab clears it.

## Publish on GitHub Pages

1. Unzip this package.
2. Create a GitHub repository. Upload `index.html`, `app.js`, `styles.css`, and this `README.md` to the repository's top level (upload the files inside the ZIP, not the ZIP as a single file).
3. In the repository, open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, then choose `main` and `/(root)`, and save.
4. Wait for GitHub Pages to publish. Your link will look like `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`.
5. Configure each user's own key as described below. Do not put anyone's key into the GitHub files.

## Configure a key for the published site

For each person's own Google Cloud project and key:

1. Enable **Places API (New)**.
2. Under **Application restrictions**, choose **Websites** and add the site's origin without the repository path. For a GitHub Pages project this is `https://YOUR-USERNAME.github.io`. Also add `http://localhost:3000` only if using the same key in the local app. If the console asks for a URL pattern, use the origin followed by `/*`.
3. Under **API restrictions**, allow **Places API (New)**.
4. Paste the key into **API key settings** and choose **Use key in this tab**. Each user enters their own key in each browser tab session.

The key is visible to its owner in the browser and is sent directly to Google at runtime. Keeping it in memory avoids app-managed persistence, but it is not secret from the browser user or browser developer tools. Website restrictions tie the key to the published website origin, not to one physical computer or IP address. Website and API restrictions are essential; set quotas/budget alerts in Google Cloud. Each user consumes their own project's usage, credits, and billing. A key does not transfer or share your free-trial credits. If someone changes a key, it takes effect on the next request.

## Features and request usage

- Search a business type and area using Places Text Search (New), 20 places per page.
- **Next page** uses the `nextPageToken` from Google to request the next page. IDs already shown are filtered out, so repeated places are not displayed. Each newly loaded page makes another Text Search request; Previous and already-loaded pages do not make a new request.
- The no-website toggle requests the website field and filters out listings with a website shown in Google Maps. No website listed does not prove the business has no website. Requesting website data can put that search into a higher-priced SKU.
- Phone and website details are fetched only when the user clicks **Show phone & website** (one Place Details request).
- **Check site with PageSpeed** opens Google's PageSpeed Insights in another tab for a listed website. It does not send the Maps key to that site.
- Results are not saved, exported, or sent to an app server. Search results and page tokens live in memory until the page is refreshed or closed.

Google determines which places appear; results are not a complete business directory. Google bills by request and fields/SKU, not by the number of rows alone. Check each user's Google Cloud usage and billing reports.
