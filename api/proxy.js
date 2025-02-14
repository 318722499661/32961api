export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const targetUrl = url.searchParams.get("url");

  if (!targetUrl || !/^https?:\/\//.test(targetUrl)) {
    return res.status(400).send(`
      <html>
        <head><title>CamoAPI Error</title></head>
        <body>
          <h1>CamoAPI Error</h1>
          <p>Error Type: 400</p>
          <p>Invalid or missing 'url' parameter.</p>
        </body>
      </html>
    `);
  }

  if (targetUrl.includes("google.com/search")) {
    const searchUrl = new URL(targetUrl);
    searchUrl.searchParams.delete("sca_esv");
    searchUrl.searchParams.delete("source");
    searchUrl.searchParams.delete("ei");
    searchUrl.searchParams.delete("iflsig");

    return res.redirect(searchUrl.toString());
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
        "Referer": targetUrl,
        "Origin": targetUrl,
      },
    });

    if (!response.ok) {
      return res.status(404).send(`
        <html>
          <head><title>CamoAPI Error</title></head>
          <body>
            <h1>CamoAPI Error</h1>
            <p>Error Type: 404</p>
            <p>Could not fetch the target page.</p>
          </body>
        </html>
      `);
    }

    const contentType = response.headers.get("content-type") || "";
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (contentType.startsWith("text/html") || contentType.startsWith("text/")) {
      let body = await response.text();
      const proxyBase = `${url.origin}${url.pathname}?url=`;

      const script = `
       <script src="https://cdn.jsdelivr.net/npm/eruda"></script>
       <script>eruda.init();</script>
      `;

      body = body.replace("</body>", `${script}</body>`);

      body = body.replace(/(href|src|action)=["'](https?:\/\/[^"'>]+)["']/gi, (_, attr, link) => {
        return `${attr}="${proxyBase}${encodeURIComponent(link)}"`;
      });

      body = body.replace(/url\(["']?(https?:\/\/[^"')]+)["']?\)/gi, (_, link) => {
        return `url("${proxyBase}${encodeURIComponent(link)}")`;
      });

      body = body.replace(/<img[^>]+src=["'](https?:\/\/[^"'>]+)["'][^>]*>/gi, (_, link) => {
        return `<img src="${proxyBase}${encodeURIComponent(link)}">`;
      });

      body = body.replace(/<source[^>]+src=["'](https?:\/\/[^"'>]+)["'][^>]*>/gi, (_, link) => {
        return `<source src="${proxyBase}${encodeURIComponent(link)}">`;
      });

      body = body.replace(/<iframe[^>]+src=["'](https?:\/\/[^"'>]+)["'][^>]*>/gi, (_, link) => {
        return `<iframe src="${proxyBase}${encodeURIComponent(link)}"></iframe>`;
      });

      body = body.replace(/<script[^>]+src=["'](https?:\/\/[^"'>]+)["'][^>]*>/gi, (_, link) => {
        return `<script src="${proxyBase}${encodeURIComponent(link)}"></script>`;
      });

      body = body.replace(/<link[^>]+href=["'](https?:\/\/[^"'>]+)["'][^>]*>/gi, (_, link) => {
        return `<link href="${proxyBase}${encodeURIComponent(link)}">`;
      });

      res.setHeader("Content-Type", contentType);
      res.send(body);
    } else {
      const buffer = Buffer.from(await response.arrayBuffer());
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", buffer.length);
      res.status(response.status).send(buffer);
    }
  } catch (error) {
    console.error(error);
    res.status(500).send(`
      <html>
        <head><title>CamoAPI Error</title></head>
        <body>
          <h1>CamoAPI Error</h1>
          <p>Error Type: 500</p>
          <p>Could not fetch the target URL.</p>
        </body>
      </html>
    `);
  }
}
