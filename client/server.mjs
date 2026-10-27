import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PORT = 3000;
const DIST_FOLDER = path.join(__dirname, 'dist');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = http.createServer((req, res) => {
    let filePath = path.join(DIST_FOLDER, req.url === '/' ? 'index.html' : req.url);

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // Not found - run webpack server middleware at root
                if (req.url === '/' || req.url === '') {
                    fs.readFile(path.join(DIST_FOLDER, 'index.html'), (err, indexContent) => {
                        if (err) {
                            res.writeHead(500);
                            res.end('Error loading index.html');
                            return;
                        }
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(indexContent);
                    });
                } else {
                    res.writeHead(404);
                    res.end('Not found');
                }
            } else {
                res.writeHead(500);
                res.end(`Server error: ${err.code}`);
            }
        } else {
            const ext = path.extname(filePath).toLowerCase();
            const contentTypes = {
                '.html': 'text/html',
                '.js': 'application/javascript',
                '.css': 'text/css',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpg',
                '.gif': 'image/gif',
                '.svg': 'image/svg+xml',
                '.ttf': 'font/ttf',
                '.woff': 'font/woff',
                '.woff2': 'font/woff2',
                '.ico': 'image/x-icon'
            };

            res.writeHead(200, {
                'Content-Type': contentTypes[ext] || 'application/octet-stream'
            });
            res.end(content);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});