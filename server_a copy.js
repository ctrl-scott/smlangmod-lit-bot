const http = require('http');
const fs = require('fs');
const path = require('path');

// Create server
const server = http.createServer((req, res) => {
  // Enable CORS for all routes
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Check if the request is for a static file or route
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  const extname = path.extname(filePath).toLowerCase();

  // Set the content type based on file extension
  let contentType = 'text/html';
  switch (extname) {
    case '.js':
      contentType = 'application/javascript';
      break;
    case '.css':
      contentType = 'text/css';
      break;
    case '.pdf':
      contentType = 'application/pdf';
      break;
    case '.json':
      contentType = 'application/json';
      break;
    case '.png':
      contentType = 'image/png';
      break;
    case '.jpg':
    case '.jpeg':
      contentType = 'image/jpeg';
      break;
    case '.gif':
      contentType = 'image/gif';
      break;
    case '.mjs':
      contentType = 'application/javascript';
      break;
  }

  // Helper function to handle file reading and response
  const sendFile = (filePath, contentType) => {
    fs.readFile(filePath, 'utf-8', (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  };

  // Check if the request is for a static file, like assets or libraries
  if (req.url.startsWith('/assets')) {
    let assetPath = path.join(__dirname, req.url);
    sendFile(assetPath, contentType);
    return;  // Make sure to return to prevent further processing
  }
  /***************************/
  /******Added in for dynamic manifest.json generation*******/
  // manifest endpoint (returns array of filenames)
  app.get('/assets', async (req, res) => {
    try {
      const files = await fs.readdir(ASSETS_DIR, { withFileTypes: true });
      const pdfs = files
        .filter(d => d.isFile() && /\.pdf$/i.test(d.name))
        .map(d => d.name);
      res.json(pdfs);
    } catch (err) {
      console.error('assets/list error', err);
      res.status(500).json({ error: 'failed to list assets' });
    }
  });

  // optional: auto-create a manifest.json under public/assets for static hosts
  app.get('/assets/gen-manifest', async (req, res) => {
    try {
      const files = await fs.readdir(ASSETS_DIR);
      const pdfs = files.filter(f => /\.pdf$/i.test(f));
      await fs.writeFile(path.join(ASSETS_DIR, 'manifest.json'), JSON.stringify(pdfs, null, 2), 'utf8');
      res.json({ ok: true, count: pdfs.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  /***************************/
  if (req.url.startsWith('/libs/pdfjs-5.4.149-dist')) {
    let libPath = path.join(__dirname, req.url);
    sendFile(libPath, contentType);
    return;  // Return to prevent further processing
  }

  // If not a static file, serve the index.html (default)
  sendFile(filePath, contentType);
});

// Start the server on port 3000
server.listen(3000, () => {
  console.log('Server is running on port 3000');
});
