const express = require('express');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- CONFIGURATION -----------------------------------------------------------
const CONFIG = {
  CLIENT_ID:    process.env.CLIENT_ID     || '',
  CLIENT_SECRET:process.env.CLIENT_SECRET || '',
  REDIRECT_URI: process.env.REDIRECT_URI  || 'http://localhost:3000/auth/callback',
  PORT:         process.env.PORT          || 3000,
  TOKEN_FILE:   process.env.TOKEN_FILE    || path.join(__dirname, 'token.json'),
};

const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

// --- OAUTH CLIENT ------------------------------------------------------------
function getOAuthClient() {
  return new google.auth.OAuth2(
    CONFIG.CLIENT_ID,
    CONFIG.CLIENT_SECRET,
    CONFIG.REDIRECT_URI
  );
}

function loadToken() {
  // 1. Priorite : variable d'environnement GMAIL_TOKEN (cloud)
  if (process.env.GMAIL_TOKEN) {
    try { return JSON.parse(process.env.GMAIL_TOKEN); } catch(e) {}
  }
  // 2. Fallback : fichier local
  if (fs.existsSync(CONFIG.TOKEN_FILE)) {
    return JSON.parse(fs.readFileSync(CONFIG.TOKEN_FILE));
  }
  return null;
}

function saveToken(token) {
  // Sauvegarder dans le fichier
  const dir = path.dirname(CONFIG.TOKEN_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG.TOKEN_FILE, JSON.stringify(token, null, 2));
  // Afficher dans les logs pour copie en env var Railway
  console.log('\n[TOKEN] Copie dans Railway > Variables > GMAIL_TOKEN :');
  console.log(JSON.stringify(token));
  console.log('');
}

// --- ROUTES ------------------------------------------------------------------

// Page principale
app.get('/', (req, res) => {
  const token = loadToken();
  const isAuth = !!token;
  res.send(renderPage(isAuth));
});

// Lancer l'authentification OAuth
app.get('/auth', (req, res) => {
  const auth = getOAuthClient();
  const url = auth.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
  res.redirect(url);
});

// Callback OAuth Google
app.get('/auth/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.send(`<p style="color:red">Erreur : ${error}</p>`);
  try {
    const auth = getOAuthClient();
    const { tokens } = await auth.getToken(code);
    saveToken(tokens);
    res.redirect('/');
  } catch (err) {
    res.send(`<p style="color:red">Erreur lors de l'echange du token : ${err.message}</p>`);
  }
});

// Deconnexion
app.get('/logout', (req, res) => {
  if (fs.existsSync(CONFIG.TOKEN_FILE)) fs.unlinkSync(CONFIG.TOKEN_FILE);
  res.redirect('/');
});

// Envoi de l'e-mail
app.post('/send', async (req, res) => {
  const { to, subject, body } = req.body;
  const token = loadToken();

  if (!token) {
    return res.json({ success: false, message: 'Non authentifie. Connecte-toi d\"abord.' });
  }

  try {
    const auth = getOAuthClient();
    auth.setCredentials(token);

    // Rafraichir le token si necessaire
    auth.on('tokens', (newTokens) => {
      const merged = { ...token, ...newTokens };
      saveToken(merged);
    });

    const gmail = google.gmail({ version: 'v1', auth });

    // Construire le mail en base64
    const messageParts = [
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(body).toString('base64'),
    ];
    const rawMessage = Buffer.from(messageParts.join('\n'))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: rawMessage },
    });

    res.json({ success: true, message: `E-mail envoye a ${to} avec succes !` });
  } catch (err) {
    res.json({ success: false, message: `Erreur d'envoi : ${err.message}` });
  }
});

// --- HTML RENDER -------------------------------------------------------------
function renderPage(isAuth) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gmail Sender</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Fraunces:opsz,wght@9..144,300;9..144,600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0d0e12;
      --surface: #16181f;
      --border: #252830;
      --accent: #5dffb6;
      --accent2: #ff6b6b;
      --text: #e8eaf0;
      --muted: #5a5d6e;
      --font-display: 'Fraunces', serif;
      --font-mono: 'DM Mono', monospace;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-mono);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }

    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background: radial-gradient(ellipse 60% 50% at 50% 0%, rgba(93,255,182,0.07) 0%, transparent 70%);
      pointer-events: none;
    }

    .container {
      width: 100%;
      max-width: 520px;
      position: relative;
    }

    header {
      margin-bottom: 2.5rem;
      text-align: center;
    }

    .logo {
      font-family: var(--font-display);
      font-size: 2.4rem;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: var(--text);
      line-height: 1;
      margin-bottom: 0.5rem;
    }

    .logo span { color: var(--accent); }

    .subtitle {
      font-size: 0.72rem;
      color: var(--muted);
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 2rem;
    }

    .status-bar {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      font-size: 0.75rem;
      color: var(--muted);
      margin-bottom: 1.8rem;
      padding-bottom: 1.2rem;
      border-bottom: 1px solid var(--border);
    }

    .dot {
      width: 7px; height: 7px;
      border-radius: 50%;
      background: ${isAuth ? 'var(--accent)' : 'var(--muted)'};
      ${isAuth ? 'box-shadow: 0 0 8px var(--accent);' : ''}
      flex-shrink: 0;
    }

    .status-text { flex: 1; }
    .status-text strong { color: ${isAuth ? 'var(--accent)' : 'var(--text)'}; }

    .btn-logout {
      font-family: var(--font-mono);
      font-size: 0.68rem;
      color: var(--muted);
      background: none;
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 0.2rem 0.6rem;
      cursor: pointer;
      text-decoration: none;
      transition: color 0.2s, border-color 0.2s;
    }
    .btn-logout:hover { color: var(--accent2); border-color: var(--accent2); }

    .field { margin-bottom: 1.2rem; }

    label {
      display: block;
      font-size: 0.68rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 0.4rem;
    }

    input, textarea {
      width: 100%;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      font-family: var(--font-mono);
      font-size: 0.85rem;
      padding: 0.75rem 1rem;
      outline: none;
      transition: border-color 0.2s;
      resize: none;
    }

    input:focus, textarea:focus {
      border-color: var(--accent);
    }

    textarea { height: 120px; line-height: 1.6; }

    .btn-send {
      width: 100%;
      margin-top: 0.8rem;
      padding: 0.9rem;
      background: var(--accent);
      color: #0d0e12;
      border: none;
      border-radius: 6px;
      font-family: var(--font-mono);
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      letter-spacing: 0.05em;
      transition: opacity 0.2s, transform 0.1s;
    }

    .btn-send:hover { opacity: 0.88; }
    .btn-send:active { transform: scale(0.99); }
    .btn-send:disabled { opacity: 0.4; cursor: not-allowed; }

    .btn-auth {
      display: block;
      width: 100%;
      padding: 0.9rem;
      background: transparent;
      color: var(--accent);
      border: 1.5px solid var(--accent);
      border-radius: 6px;
      font-family: var(--font-mono);
      font-size: 0.85rem;
      cursor: pointer;
      letter-spacing: 0.05em;
      text-align: center;
      text-decoration: none;
      transition: background 0.2s, color 0.2s;
    }

    .btn-auth:hover { background: var(--accent); color: #0d0e12; }

    #result {
      margin-top: 1rem;
      padding: 0.75rem 1rem;
      border-radius: 6px;
      font-size: 0.8rem;
      display: none;
    }

    #result.success { background: rgba(93,255,182,0.08); border: 1px solid rgba(93,255,182,0.3); color: var(--accent); }
    #result.error { background: rgba(255,107,107,0.08); border: 1px solid rgba(255,107,107,0.3); color: var(--accent2); }

    .hint {
      margin-top: 1.5rem;
      font-size: 0.68rem;
      color: var(--muted);
      text-align: center;
      line-height: 1.8;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">mail<span>.</span>send</div>
      <div class="subtitle">Gmail OAuth - Envoi direct</div>
    </header>

    <div class="card">
      ${isAuth ? `
      <div class="status-bar">
        <div class="dot"></div>
        <div class="status-text">Connecte - <strong>Pret a envoyer</strong></div>
        <a href="/logout" class="btn-logout">Deconnexion</a>
      </div>
      <form id="emailForm">
        <div class="field">
          <label>Destinataire</label>
          <input type="email" name="to" placeholder="exemple@gmail.com" required>
        </div>
        <div class="field">
          <label>Objet</label>
          <input type="text" name="subject" placeholder="Objet de l'e-mail" required>
        </div>
        <div class="field">
          <label>Message</label>
          <textarea name="body" placeholder="Ton message ici..." required></textarea>
        </div>
        <button type="submit" class="btn-send" id="sendBtn">Envoyer &rarr;</button>
        <div id="result"></div>
      </form>
      ` : `
      <div class="status-bar">
        <div class="dot"></div>
        <div class="status-text">Non connecte - <strong>Authentification requise</strong></div>
      </div>
      <p style="font-size:0.8rem; color:var(--muted); margin-bottom:1.5rem; line-height:1.7;">
        Connecte ton compte Google pour autoriser l'envoi d'e-mails via Gmail.
      </p>
      <a href="/auth" class="btn-auth">Se connecter avec Google &rarr;</a>
      `}
    </div>

    <div class="hint">
      mail.send - Port ${CONFIG.PORT} - ${process.env.RAILWAY_ENVIRONMENT ? 'Cloud Railway' : 'Serveur local'}
    </div>
  </div>

  ${isAuth ? `
  <script>
    document.getElementById('emailForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('sendBtn');
      const result = document.getElementById('result');
      const form = e.target;

      btn.disabled = true;
      btn.textContent = 'Envoi en cours...';
      result.style.display = 'none';

      const data = {
        to: form.to.value,
        subject: form.subject.value,
        body: form.body.value,
      };

      try {
        const res = await fetch('/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const json = await res.json();
        result.style.display = 'block';
        result.className = json.success ? 'success' : 'error';
        result.textContent = json.message;
        if (json.success) form.reset();
      } catch (err) {
        result.style.display = 'block';
        result.className = 'error';
        result.textContent = 'Erreur reseau : ' + err.message;
      }

      btn.disabled = false;
      btn.textContent = 'Envoyer \u2192';
    });
  </script>
  ` : ''}
</body>
</html>`;
}

// --- DEMARRAGE ---------------------------------------------------------------
app.listen(CONFIG.PORT, () => {
  console.log('\n[OK] Gmail Sender demarre sur http://localhost:' + CONFIG.PORT);
  console.log('\n[!] N\'oublie pas de remplir CLIENT_ID et CLIENT_SECRET\n');
});
