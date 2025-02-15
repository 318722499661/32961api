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

    if (contentType.includes('text/html')) {
      let htmlContent = response.data.toString('utf-8');

      const script = `
        <script src="https://cdn.jsdelivr.net/npm/eruda"></script>
        <script>eruda.init();</script>
        <script>
          document.addEventListener('submit', function(e) {
            let form = e.target;
            if (form && form.action) {
              let originalAction = form.action;
              if (originalAction && !originalAction.startsWith('/proxy?url=')) {
                form.action = '/proxy?url=' + encodeURIComponent(originalAction);
              }
            }
          });

          const inputs = document.querySelectorAll('input[type="search"], input[type="text"]');
          inputs.forEach(input => {
            input.addEventListener('keydown', function(e) {
              if (e.key === 'Enter' && input.form) {
                let form = input.form;
                let originalAction = form.action;
                if (originalAction && !originalAction.startsWith('/proxy?url=')) {
                  form.action = '/proxy?url=' + encodeURIComponent(originalAction);
                }
              }
            });
          });

          document.addEventListener('click', function(e) {
            if (e.target.tagName === 'A') {
              const link = e.target;
              let linkHref = link.href;
              if (linkHref && !linkHref.startsWith('/proxy?url=')) {
                link.href = '/proxy?url=' + encodeURIComponent(linkHref);
              }
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

          document.addEventListener('DOMContentLoaded', function() {
            const metaTags = document.getElementsByTagName('meta');
            Array.from(metaTags).forEach(tag => {
              if (tag.getAttribute('http-equiv') === 'refresh') {
                let content = tag.getAttribute('content');
                const match = content && content.match(/url=([^;]+)/);
                if (match && match[1]) {
                  let newUrl = match[1];
                  if (newUrl && !newUrl.startsWith('/proxy?url=')) {
                    tag.setAttribute('content', 'url=/proxy?url=' + encodeURIComponent(newUrl));
                  }
                }
              }
            });
          });

          // Intercept AJAX requests (XMLHttpRequest and Fetch API)
          const open = XMLHttpRequest.prototype.open;
          XMLHttpRequest.prototype.open = function(method, url) {
            if (url && !url.startsWith('/proxy?url=')) {
              url = '/proxy?url=' + encodeURIComponent(url);
            }
            open.apply(this, arguments);
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

      htmlContent = htmlContent.replace(/(src|href|srcset)="(\/[^"]+)"/g, (match, p1, p2) => {
        return `${p1}="/proxy?url=${encodeURIComponent(targetUrl + p2)}"`;
      });

      htmlContent = htmlContent.replace(/url\(\s*["']?(\/[^"')]+)["']?\s*\)/g, (match, p1) => {
        return `url("/proxy?url=${encodeURIComponent(targetUrl + p1)}")`;
      });

      htmlContent = htmlContent.replace(/<script src="(\/[^"]+)"/g, (match, p1) => {
        return `<script src="/proxy?url=${encodeURIComponent(targetUrl + p1)}"`;
      });

      htmlContent = htmlContent.replace('</body>', `${script}</body>`);

      res.setHeader('Content-Type', 'text/html');
      res.status(response.status).send(htmlContent);
    } else if (contentType.includes('text/css')) {
      let cssContent = response.data.toString('utf-8');

      cssContent = cssContent.replace(/url\(\s*["']?(\/[^"')]+)["']?\s*\)/g, (match, p1) => {
        return `url("/proxy?url=${encodeURIComponent(targetUrl + p1)}")`;
      });

      res.setHeader('Content-Type', 'text/css');
      res.status(response.status).send(cssContent);
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
