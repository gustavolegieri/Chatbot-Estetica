import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const port = Number(process.argv[2] || 4173);
const root = resolve("dist");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function sendFile(filePath, response) {
  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
}

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const requestedPath = resolve(root, `.${pathname}`);
    if (requestedPath !== root && !requestedPath.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    let filePath = requestedPath;
    try {
      const info = await stat(filePath);
      if (info.isDirectory()) filePath = resolve(filePath, "index.html");
      await stat(filePath);
    } catch {
      filePath = resolve(root, "index.html");
    }

    sendFile(filePath, response);
  } catch {
    response.writeHead(500).end("Internal Server Error");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Projeto disponível em http://localhost:${port}`);
});
