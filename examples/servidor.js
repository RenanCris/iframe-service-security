const http = require("http");
const fs = require("fs");
const path = require("path");

function servirBibliotecaSeExistir(res) {
  const caminhoBiblioteca = path.join(__dirname, "../dist/index.global.js");
  if (fs.existsSync(caminhoBiblioteca)) {
    res.writeHead(200, {
      "Content-Type": "application/javascript; charset=utf-8",
    });
    res.end(fs.readFileSync(caminhoBiblioteca));
  } else {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(
      "Erro: Arquivo dist/index.global.js não encontrado. Execute npm run build antes.",
    );
  }
}

http
  .createServer((req, res) => {
    if (req.url === "/dist/index.global.js" || req.url === "/index.global.js") {
      servirBibliotecaSeExistir(res);
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
    });
    res.end(fs.readFileSync(path.join(__dirname, "pai.html")));
  })
  .listen(3000, () => console.log("🌐 Pai rodando em http://localhost:3000"));

http
  .createServer((req, res) => {
    if (req.url === "/lib.js") {
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end(fs.readFileSync(path.join(__dirname, "../dist/index.global.js")));
      return;
    }

    // Rota padrão do HTML do filho aplicando os cabeçalhos restritivos de isolamento
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "frame-ancestors http://localhost:3000 http://127.0.0.1:3000",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(fs.readFileSync(path.join(__dirname, "filho.html")));
  })
  .listen(4000, () =>
    console.log("🔒 Iframe Filho rodando em http://localhost:4000"),
  );
