const express = require('express');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// âââ CONFIGURATION ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const CONFIG = {
  CLIENT_ID:    process.env.CLIENT_ID     || '',
  CLIENT_SECRET:process.env.CLIENT_SECRET || '',
  REDIRECT_URI: process.env.REDIRECT_URI  || 'http://localhost:3000/auth/callback',
  PORT:         process.env.PORT          || 3000,
  TOKEN_FILE:   process.env.TOKEN_FILE    || path.join(__dirname, 'token.json'),
};

const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

// âââ OAUTH CLIENT âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
function getOAuthClient() {
  return new google.auth.OAuth2(
    CONFIG.CLIENT_ID,
    CONFIG.CLIENT_SECRET,
    CONFIG.REDIRECT_URI
  );
}

function loadToken() {
  // 1. PrioritÃ© : variable d'environnement GMAIL_TOKEN (cloud)
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
  console.log('\nð TOKEN (copie dans Railway > Variables > GMAIL_TOKEN) :
');
  console.log(JSON.stringify(token));
  console.log('');
}

// âââ ROUTES âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
app.get('/', (req, res) => {
  const token = loadToken();
  const isAuth = !!token;
  res.send(renderPage(isAuth));
});

app.get('/auth', (req, res) => {
  const auth = getOAuthClient();
  const url = auth.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.send(`<p style="color:red">Erreur : ${error}</p>`);
  try {
    const auth = getOAuthClient();
    const { tokens } = await auth.getToken(code);
    saveToken(tokens);
    res.redirect('/');
  } catch (err) {
    res.send(`<p style="color:red">Erreur lors de l'Ã©change du token : ${err.message}</p>`);
  }
});

app.get('/logout', (req, res) => {
  if (fs.existsSync(CONFIG.TOKEN_FILE)) fs.unlinkSync(CONFIG.TOKEN_FILE);
  res.redirect('/');
});

app.post('/send', async (req, res) => {
  const { to, subject, body } = req.body;
  const token = loadToken();
  if (!token) return res.json({ success: false, message: 'Non authentifier. Connecte-toi d\'abord.' });
  try {
    const auth = getOAuthClient();
    auth.setCredentials(token);
    auth.on('tokens', (newTokens) => { saveToken({ ...token, ...newTokens }); });
    const gmail = google.gmail({ version: 'v1', auth });
    const msg = [`To: ${to}`,`Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,'MIME-Version: 1.0','Content-Type: text/plain; charset=utf-8','Content-Transfer-Encoding: base64','',Buffer.from(body).toString('base64')];
    const raw = Buffer.from(msg.join('\n')).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    res.json({ success: true, message: `E-mail envoye a ${to} avec succes !` });
  } catch (err) {
    res.json({ success: false, message: `Erreur d'envoi : ${err.message}` });
  }
});

function renderPage(isAuth) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Gmail Sender</title><link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Fraunces:opsz,wght@9..144,300;9..144,600" rel="stylesheet"><style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}:root{--bg:#0d0e12;--surface:#16181f;--border:#252830;--accent:#5dffb6;--accent2:#ff6b6b;--text:#e8eaf0;--muted:#5a5d6e;--font-display:'Fraunces',serif;--font-mono:'DM Mono', monospace}body{background:var(--bg);color:var(--text);font-family:var(--font-mono);min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem}.container{width:100%;max-width:520px}.logo{font-family:var(--font-display);font-size:2.4rem;font-weight:600;color:var(--text);line-height:1}.logo span{color:var(--accent)}.subtitle{font-size:.72rem;color:var(--muted);letter-spacing:.12em;text-transform:uppercase}.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:2rem}.status-bar{display:flex;align-items:center;gap:.6rem;font-size:.t5rem;color:var(--muted);margin-bottom:1.8rem;padding-bottom:1.2rem;border-bottom:1px solid var(--border)}.dot{width:7px;height:7px;border-radius:50%;background:${isAuth?'var(--accent)':'var(--muted)'};${isAuth?'box-shadow:0 0 8px var(--accent);':''}flex-shrink:0}.status-text{flex:1}.status-text strong{color:${isAuth?'var(--accent)':'var(--text)'}}.btn-logout{font-family:var(--font-mono);font-size:.68rem;color:var(--muted);background:none;border:1px solid var(--border);border-radius:4px;padding:.2rem .6rem;cursor:pointer;text-decoration:none}.field{margin-bottom:1.2rem}label{display:block;font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:.4rem}input,textarea{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:var(--font-mono);font-size:.85rem;padding:.75rem 1rem;outline:none;resize:none}textarea{height:120px}.btn-send{width:100%;margin-top:.8rem;padding:.9rem;background:var(--accent);color:#0d0e12;border:none;border-radius:6px;font-family:var(--font-mono);font-size:.85rem;font-weight:500;cursor:pointer}.btn-auth{display:block;width:100%;padding:.9rem;background:transparent;color:var(--accent);border:1.5px solid var(--accent);border-radius:6px;font-family:var(--font-mono);font-size:.85rem;cursor:pointer;text-align:center;text-decoration:none}#result{margin-top:1rem;padding:.t5rem 1rem;border-radius:6px;font-size:.8rem;display:none}#result.success{background:rgba(93,255,182,.08);border:1px solid rgba(93,255,182,.3);color:var(--accent)}#result.error{background:rgba(255,107,107,.08);border:1px solid rgba(255,107,107,.3);color:var(--accent2)}.hint{margin-top:1.5rem;font-size:.68rem;color:var(--muted);text-align:center;line-height:1.8}</style></head><body><div class="container"><header><div class="logo">mail<span>.</span>send</div><div class="subtitle">Gmail OAuth &#8212; Envoi direct</div></header><div class="card">${isAuth?`<div class="status-bar"><div class="dot"></div><div class="status-text">Connecte &#8212; <strong>Pret a envoyer</strong></div><a href="/logout" class="btn-logout">Deconnexion</a></div><form id="emailForm"><div class="field"><label>Destinataire</label><input type="email" name="to" placeholder="exemple@gmail.com" required></div><div class="field"><label>Objet</label><input type="text" name="subject" placeholder="Objet" required></div><div class="field"><label>Message</label><textarea name="body" placeholder="Ton message..." required></textarea></div><button type="submit" class="btn-send" id="sendBtn">Envoyer &#8594;</button><div id="result"></div></form>`:`<div class="status-bar"><div class="dot"></div><div class="status-text">Non connecte &#8212; <strong>Authentification requise</strong></div></div><p style="font-size:.8rem;color:var(--muted);margin-bottom:1.5rem">Connecte ton compte Google pour autoriser l'envoi d'e-mails via Gmail.</p><a href="/auth" class="btn-auth">Se connecter avec Google &#8594;</a>`}</div><div class="hint">mail.send &#183; Port ${CONFIG.PORT} &#183; ${process.env.RAILWAY_ENVIRONMENT?'Cloud Railway':'Serveur local'}</div></div>${isAuth?`<script>document.getElementById('emailForm').addEventListener('submit',async e=>{e.preventDefault();const btn=document.getElementById('sendBtn');const result=document.getElementById('result');const form=e.target;btn.disabled=true;btn.textContent='Envoi en cours...';result.style.display='none';try{const res=await fetch('/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:form.to.value,subject:form.subject.value,body:form.body.value})});const json=await res.json();result.style.display='block';result.className=json.success?'success':'error';result.textContent=json.message;if(json.success)form.reset()}catch(err){result.style.display='block';result.className='error';result.textContent='Erreur reseau : '+err.message}btn.disabled=false;btn.textContent='Envoyer &#8594;'});</script>`:''}</body></html>`;
}

app.listen(CONFIG.PORT,()=>{
  console.log(`\nâ Gmail Sender demarre sur http://localhost:${CONFIG.PORT}`);
});
