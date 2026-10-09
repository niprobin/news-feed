# News Feed

A static web app that shows news articles from the n8n webhook `https://n8n.niprobin.com/webhook/news`.

- Date filters: this week, this month, last 3 months
- Articles grouped by month
- Grid view by default, with a list view option

There's no build step. Deploy the folder as a static site (on Vercel, use the "Other" framework preset), or run it locally:

```sh
python3 -m http.server 8000
```
