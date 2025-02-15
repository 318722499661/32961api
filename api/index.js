const express = require('express');
const axios = require('axios');
const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.get('/proxy', async (req, res) => {
  const { query } = req;
  let targetUrl = query.url;

  if (!targetUrl) {
    return res.status(400).send('No target URL provided');
  }

  targetUrl = decodeURIComponent(targetUrl);
  targetUrl = targetUrl.replace(/%3A/g, ':').replace(/%2F/g, '/'); // Decode additional parts if necessary

  try {
    const response = await axios.get(targetUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': req.headers['user-agent'],
        'Accept': '*/*',
        'Cache-Control': 'no-cache',
      },
      maxRedirects: 10,
    });

    const contentType = response.headers['content-type'];

    // If the content is HTML, handle it as before (inject script)
    if (contentType.includes('text/html')) {
      let htmlContent = response.data.toString('utf-8');
      const injectScript = `
        <script src="https://cdn.jsdelivr.net/npm/eruda"></script>
        <script>eruda.init();</script>
        <script>
          document.querySelectorAll('a').forEach(a => {
            let href = a.href;
            if (href && !href.startsWith('/proxy?url=')) {
              a.href = '/proxy?url=' + encodeURIComponent(href);
            }
          });

          document.querySelectorAll('form').forEach(form => {
            let action = form.action;
            if (action && !action.startsWith('/proxy?url=')) {
              form.action = '/proxy?url=' + encodeURIComponent(action);
            }
          });

          document.querySelectorAll('img').forEach(img => {
            let src = img.src;
            if (src && !src.startsWith('/proxy?url=')) {
              img.src = '/proxy?url=' + encodeURIComponent(src);
            }
          });

          const originalLocation = window.location;
          Object.defineProperty(window, 'location', {
            set: function(value) {
              if (value && !value.startsWith('/proxy?url=')) {
                value = '/proxy?url=' + encodeURIComponent(value);
              }
              originalLocation.assign(value);
            }
          });

          const originalOpen = window.open;
          window.open = function(url) {
            if (url && !url.startsWith('/proxy?url=')) {
              url = '/proxy?url=' + encodeURIComponent(url);
            }
            return originalOpen.apply(window, [url]);
          };

          const originalXHR = XMLHttpRequest.prototype.open;
          XMLHttpRequest.prototype.open = function(method, url) {
            if (url && !url.startsWith('/proxy?url=')) {
              url = '/proxy?url=' + encodeURIComponent(url);
            }
            originalXHR.apply(this, arguments);
          };

          const originalFetch = window.fetch;
          window.fetch = function(input, init) {
            if (typeof input === 'string' && input && !input.startsWith('/proxy?url=')) {
              input = '/proxy?url=' + encodeURIComponent(input);
            }
            return originalFetch(input, init);
          };
        </script>
      `;
      htmlContent = htmlContent.replace('</body>', `${injectScript}</body>`);

      res.setHeader('Content-Type', 'text/html');
      res.status(response.status).send(htmlContent);

    // For other types like images, handle them directly and send the response
    } else {
      res.setHeader('Content-Type', contentType);
      res.status(response.status).send(Buffer.from(response.data));
    }

  } catch (error) {
    console.error('Error proxying request:', error);
    res.status(500).send('Error proxying request');
  }
});

module.exports = app;
