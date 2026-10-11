#!/usr/bin/env node

const os = require('os');
const http = require('http');
const fs = require('fs');
const axios = require('axios');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const { Buffer } = require('buffer');
const { exec, execSync } = require('child_process');
const { WebSocket, createWebSocketStream } = require('ws');
const UUID = process.env.UUID || '5efabea4-f6d4-91fd-b8f0-17e004c89c60'; // 运行哪吒v1,在不同的平台需要改UUID,否则会被覆盖
const NEZHA_SERVER = process.env.NEZHA_SERVER || '';       // 哪吒v1填写形式：nz.abc.com:8008   哪吒v0填写形式：nz.abc.com
const NEZHA_PORT = process.env.NEZHA_PORT || '';           // 哪吒v1没有此变量，v0的agent端口为{443,8443,2096,2087,2083,2053}其中之一时开启tls
const NEZHA_KEY = process.env.NEZHA_KEY || '';             // v1的NZ_CLIENT_SECRET或v0的agent端口                
const DOMAIN = process.env.DOMAIN || 'your-domain.com';    // 填写项目域名或已反代的域名，不带前缀，建议填已反代的域名
const AUTO_ACCESS = process.env.AUTO_ACCESS || false;      // 是否开启自动访问保活,false为关闭,true为开启,需同时填写DOMAIN变量
const WSPATH = process.env.WSPATH || UUID.slice(0, 8);     // 节点路径，默认获取uuid前8位
const SUB_PATH = process.env.SUB_PATH || 'sub';            // 获取节点的订阅路径
const SUB_PASSWORD = process.env.SUB_PASSWORD || '';      // 订阅页访问密码,为空则不开启密码保护
const NAME = process.env.NAME || '';                       // 节点名称
const PORT = process.env.PORT || 3000;                     // http和ws服务端口

let uuid = UUID.replace(/-/g, ""), CurrentDomain = DOMAIN, Tls = 'tls', CurrentPort = 443, ISP = '';
const DNS_SERVERS = ['8.8.4.4', '1.1.1.1'];
const BLOCKED_DOMAINS = [
  'speedtest.net', 'fast.com', 'speedtest.cn', 'speed.cloudflare.com', 'speedof.me',
   'testmy.net', 'bandwidth.place', 'speed.io', 'librespeed.org', 'speedcheck.org'
];

// block speedtest domains
function isBlockedDomain(host) {
  if (!host) return false;
  const hostLower = host.toLowerCase();
  return BLOCKED_DOMAINS.some(blocked => {
    return hostLower === blocked || hostLower.endsWith('.' + blocked);
  });
}

async function getisp() {
  try {
    const res = await axios.get('https://api.ip.sb/geoip', { headers: { 'User-Agent': 'Mozilla/5.0', timeout: 3000 }});
    const data = res.data;
    ISP = `${data.country_code}-${data.isp}`.replace(/ /g, '_');
  } catch (e) {
    try {
      const res2 = await axios.get('http://ip-api.com/json', { headers: { 'User-Agent': 'Mozilla/5.0', timeout: 3000 }});
      const data2 = res2.data;
      ISP = `${data2.countryCode}-${data2.org}`.replace(/ /g, '_');
    } catch (e2) {
      ISP = 'Unknown';
    }
  }
}

async function getip() {
  if (!DOMAIN || DOMAIN === 'your-domain.com') {
      try {
          const res = await axios.get('https://api-ipv4.ip.sb/ip', { timeout: 5000 });
          const ip = res.data.trim();
          CurrentDomain = ip, Tls = 'none', CurrentPort = PORT;
      } catch (e) {
          console.error('Failed to get IP', e.message);
          CurrentDomain = 'cahnge-your-domain.com', Tls = 'tls', CurrentPort = 443;
      }
  } else {
      CurrentDomain = DOMAIN, Tls = 'tls', CurrentPort = 443;
  }
}


// 订阅美化页(清新浅紫风格)
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderSubPage(o) {
  const card = (proto, link, i) => `
    <div class="card">
      <div class="card-title"><span class="badge">${proto}</span>
        <button onclick="copyText('link${i}')">复制链接</button></div>
      <div class="link" id="link${i}">${escapeHtml(link)}</div>
    </div>`;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>订阅中心 - ${escapeHtml(o.namePart)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    color: #4a4458; padding: 28px 16px; min-height: 100vh;
    background-color: #ece8f7;
    background-image:
      linear-gradient(45deg, #e1daf5 25%, transparent 25%, transparent 75%, #e1daf5 75%),
      linear-gradient(45deg, #e1daf5 25%, transparent 25%, transparent 75%, #e1daf5 75%);
    background-size: 48px 48px;
    background-position: 0 0, 24px 24px;
  }
  .wrap { max-width: 860px; margin: 0 auto; }
  .header { text-align: center; margin-bottom: 22px; }
  .header h1 { font-size: 26px; color: #5b4b8a; letter-spacing: 8px; }
  .header .en { font-size: 11px; color: #9a8fc7; letter-spacing: 4px; margin-top: 8px; }
  .status { display: inline-block; margin-top: 10px; font-size: 12px; color: #2e9e5b; background: #e6f9ee; border-radius: 20px; padding: 4px 14px; }
  .card { background: #fff; border: 2px dashed #b9aef0; border-radius: 14px; padding: 18px 20px; margin-bottom: 18px; box-shadow: 0 2px 10px rgba(120,100,200,.08); }
  .card-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 15px; font-weight: 700; color: #5b4b8a; }
  .badge { background: #efeaff; color: #6a5acd; border-radius: 8px; padding: 3px 12px; font-size: 13px; }
  .link { font-size: 12px; color: #8a83a3; word-break: break-all; background: #f7f5ff; border-radius: 8px; padding: 10px 12px; font-family: monospace; max-height: 84px; overflow: hidden; }
  .node-line { display: flex; justify-content: space-between; font-size: 14px; padding: 4px 0; }
  .node-line b { color: #5b4b8a; }
  button { background: #7c6cf0; color: #fff; border: none; border-radius: 10px; padding: 8px 18px; font-size: 13px; cursor: pointer; }
  button:hover { background: #6a5ad0; }
  button:active { transform: scale(.97); }
  .tip { text-align: center; font-size: 12px; color: #9a8fc7; line-height: 2; margin-top: 6px; }
  .ok { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #7c6cf0; color: #fff; border-radius: 20px; padding: 8px 26px; font-size: 14px; display: none; z-index: 99; box-shadow: 0 4px 14px rgba(124,108,240,.4); }
</style>
</head>
<body>
<div class="ok" id="ok">已复制</div>
<div class="wrap">
  <div class="header">
    <h1>订阅中心</h1>
    <div class="en">SUBSCRIPTION CENTER</div>
    <div class="status">● 运行中</div>
  </div>
  <div class="card">
    <div class="card-title">节点信息</div>
    <div class="node-line"><span>节点名称</span><b>${escapeHtml(o.namePart)}</b></div>
    <div class="node-line"><span>协议</span><b>VLESS / Trojan / Shadowsocks</b></div>
  </div>
  ${card('VLESS', o.vlsURL, 0)}
  ${card('TROJAN', o.troURL, 1)}
  ${card('SHADOWSOCKS', o.ssURL, 2)}
  <div class="card">
    <div class="card-title"><span>订阅内容</span><button onclick="copyText('b64')">复制订阅</button></div>
    <div class="link" id="b64">${escapeHtml(o.base64Content)}</div>
  </div>
  <div class="tip">v2rayNG / Nekoray / Streisand 等客户端<br>请直接使用订阅地址自动更新，无需手动复制</div>
</div>
<script>
function copyText(id) {
  var t = document.getElementById(id).innerText;
  function done() { var o = document.getElementById('ok'); o.style.display = 'block'; setTimeout(function(){ o.style.display = 'none'; }, 1200); }
  function fallback() {
    var ta = document.createElement('textarea');
    ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    document.body.removeChild(ta);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(done).catch(fallback);
  } else { fallback(); }
}
</script>
</body>
</html>`;
}

// 密码保护相关
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

function parseCookies(req) {
  const out = {};
  const h = req.headers.cookie;
  if (h) h.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e5) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(''));
  });
}

// 密码输入页(浅紫主题)
function renderPwdPage(isError) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>订阅中心 - 请输入密码</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    color: #4a4458; padding: 28px 16px; min-height: 100vh;
    background-color: #ece8f7;
    background-image:
      linear-gradient(45deg, #e1daf5 25%, transparent 25%, transparent 75%, #e1daf5 75%),
      linear-gradient(45deg, #e1daf5 25%, transparent 25%, transparent 75%, #e1daf5 75%);
    background-size: 48px 48px;
    background-position: 0 0, 24px 24px;
  }
  .wrap { max-width: 520px; margin: 0 auto; padding-top: 8vh; }
  .header { text-align: center; margin-bottom: 22px; }
  .header h1 { font-size: 26px; color: #5b4b8a; letter-spacing: 8px; }
  .header .en { font-size: 11px; color: #9a8fc7; letter-spacing: 4px; margin-top: 8px; }
  .card { background: #fff; border: 2px dashed #b9aef0; border-radius: 14px; padding: 30px 28px; box-shadow: 0 2px 10px rgba(120,100,200,.08); text-align: center; }
  .card-title { font-size: 16px; font-weight: 700; color: #5b4b8a; margin-bottom: 18px; }
  .pwd-input { width: 100%; font-size: 15px; color: #4a4458; background: #f7f5ff; border: 2px solid #d9d2f5; border-radius: 10px; padding: 11px 14px; outline: none; margin-bottom: 16px; }
  .pwd-input:focus { border-color: #7c6cf0; }
  button { background: #7c6cf0; color: #fff; border: none; border-radius: 10px; padding: 10px 42px; font-size: 14px; cursor: pointer; letter-spacing: 6px; }
  button:hover { background: #6a5ad0; }
  button:active { transform: scale(.97); }
  .err { margin-top: 14px; font-size: 13px; color: #e05252; }
  .tip { text-align: center; font-size: 12px; color: #9a8fc7; line-height: 2; margin-top: 14px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>订阅中心</h1>
    <div class="en">SUBSCRIPTION CENTER</div>
  </div>
  <div class="card">
    <div class="card-title">&#128274; 请输入访问密码</div>
    <form method="POST" action="/${SUB_PATH}">
      <input class="pwd-input" type="password" name="password" placeholder="请输入密码" autocomplete="off" required autofocus>
      <button type="submit">进 入</button>
    </form>
    ${isError ? '<div class="err">密码错误,请重试</div>' : ''}
  </div>
  <div class="tip">此订阅为私人分享<br>请输入密码后查看节点信息</div>
</div>
</body>
</html>`;
}

// Clash 类客户端订阅: 返回可直接导入的 YAML 配置
function buildClashYaml() {
  const domain = CurrentDomain;
  const port = CurrentPort;
  const wsPath = '/' + WSPATH;
  return `# XSM Clash 订阅配置 (node-ws 自动生成)
port: 7890
socks-port: 7891
allow-lan: false
mode: rule
log-level: info
ipv6: false
proxies:
  - name: "XSM-VLESS"
    type: vless
    server: ${domain}
    port: ${port}
    uuid: ${UUID}
    tls: true
    servername: ${domain}
    network: ws
    ws-opts:
      path: "${wsPath}"
      headers:
        Host: ${domain}
  - name: "XSM-Trojan"
    type: trojan
    server: ${domain}
    port: ${port}
    password: ${UUID}
    sni: ${domain}
    network: ws
    ws-opts:
      path: "${wsPath}"
      headers:
        Host: ${domain}
proxy-groups:
  - name: "PROXY"
    type: select
    proxies:
      - "XSM-VLESS"
      - "XSM-Trojan"
rules:
  - "MATCH,PROXY"
`;
}

// http route
const httpServer = http.createServer(async (req, res) => {
  if (req.url === '/') {
    const filePath = path.join(__dirname, 'index.html');
    fs.readFile(filePath, 'utf8', (err, content) => {
      if (err) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('Hello world!');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
    });
    return;
  } else if ((req.url || '').split('?')[0] === `/${SUB_PATH}`) {
    await getisp();await getip();
    const namePart = NAME ? `${NAME}-${ISP}` : ISP;
    const tlsParam = Tls === 'tls' ? 'tls' : 'none';
    const ssTlsParam = Tls === 'tls' ? 'tls;' : '';
    const vlsURL = `vless://${UUID}@${CurrentDomain}:${CurrentPort}?encryption=none&security=${tlsParam}&sni=${CurrentDomain}&fp=chrome&type=ws&host=${CurrentDomain}&path=%2F${WSPATH}#${namePart}`;
    const troURL = `trojan://${UUID}@${CurrentDomain}:${CurrentPort}?security=${tlsParam}&sni=${CurrentDomain}&fp=chrome&type=ws&host=${CurrentDomain}&path=%2F${WSPATH}#${namePart}`;
    const ssMethodPassword = Buffer.from(`none:${UUID}`).toString('base64');
    const ssURL = `ss://${ssMethodPassword}@${CurrentDomain}:${CurrentPort}?plugin=v2ray-plugin;mode%3Dwebsocket;host%3D${CurrentDomain};path%3D%2F${WSPATH};${ssTlsParam}sni%3D${CurrentDomain};skip-cert-verify%3Dtrue;mux%3D0#${namePart}`;
    const subscription = vlsURL + '\n' + troURL + '\n' + ssURL;
    const base64Content = Buffer.from(subscription).toString('base64');

    const pageData = { namePart, vlsURL, troURL, ssURL, base64Content };
    const ua = (req.headers['user-agent'] || '').toLowerCase();

    // 设置了 SUB_PASSWORD: 仅浏览器页面需要密码,订阅客户端直接返回(复制即用)
    if (SUB_PASSWORD && ua.includes('mozilla')) {
        // 浏览器: Cookie 免登,否则显示密码页
        if (req.method === 'POST') {
          const body = await readBody(req);
          const pwd = new URLSearchParams(body).get('password') || '';
          if (pwd === SUB_PASSWORD) {
            res.writeHead(200, {
              'Content-Type': 'text/html; charset=utf-8',
              'Set-Cookie': `sub_auth=${sha256(SUB_PASSWORD)}; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax`
            });
            res.end(renderSubPage(pageData));
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(renderPwdPage(true));
          }
          return;
        }
        const cookies = parseCookies(req);
        if (cookies.sub_auth === sha256(SUB_PASSWORD)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(renderSubPage(pageData));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderPwdPage(false));
        return;
    }

    // 浏览器访问 -> 返回美化订阅页;Clash 类客户端 -> 返回 YAML 配置;其他订阅客户端 -> 返回原始 base64
    if (ua.includes('mozilla')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderSubPage(pageData));
    } else if (/clash|mihomo|stash/i.test(ua) || new URL(req.url || '/', 'http://localhost').searchParams.get('format') === 'yaml') {
      res.writeHead(200, { 'Content-Type': 'text/yaml; charset=utf-8' });
      res.end(buildClashYaml());
    } else {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(base64Content + '\n');
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found\n');
  }
});

// Custom DNS
function resolveHost(host) {
  return new Promise((resolve, reject) => {
    if (/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(host)) {
      resolve(host);
      return;
    }
    let attempts = 0;
    function tryNextDNS() {
      if (attempts >= DNS_SERVERS.length) {
        reject(new Error(`Failed to resolve ${host} with all DNS servers`));
        return;
      }
      const dnsServer = DNS_SERVERS[attempts];
      attempts++;
      const dnsQuery = `https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`;
      axios.get(dnsQuery, {
        timeout: 5000,
        headers: {
          'Accept': 'application/dns-json'
        }
      })
        .then(response => {
          const data = response.data;
          if (data.Status === 0 && data.Answer && data.Answer.length > 0) {
            const ip = data.Answer.find(record => record.type === 1);
            if (ip) {
              resolve(ip.data);
              return;
            }
          }
          tryNextDNS();
        })
        .catch(error => {
          tryNextDNS();
        });
    }

    tryNextDNS();
  });
}

// VLE-SS处理
function handleVlsConnection(ws, msg) {
  const [VERSION] = msg;
  const id = msg.slice(1, 17);
  if (!id.every((v, i) => v == parseInt(uuid.substr(i * 2, 2), 16))) return false;

  let i = msg.slice(17, 18).readUInt8() + 19;
  const port = msg.slice(i, i += 2).readUInt16BE(0);
  const ATYP = msg.slice(i, i += 1).readUInt8();
  const host = ATYP == 1 ? msg.slice(i, i += 4).join('.') :
    (ATYP == 2 ? new TextDecoder().decode(msg.slice(i + 1, i += 1 + msg.slice(i, i + 1).readUInt8())) :
      (ATYP == 3 ? msg.slice(i, i += 16).reduce((s, b, i, a) => (i % 2 ? s.concat(a.slice(i - 1, i + 1)) : s), []).map(b => b.readUInt16BE(0).toString(16)).join(':') : ''));

  if (isBlockedDomain(host)) {
    ws.close();
    return false;
  }
  ws.send(new Uint8Array([VERSION, 0]));
  const duplex = createWebSocketStream(ws);
  resolveHost(host)
    .then(resolvedIP => {
      net.connect({ host: resolvedIP, port }, function () {
        this.write(msg.slice(i));
        duplex.on('error', () => { }).pipe(this).on('error', () => { }).pipe(duplex);
      }).on('error', () => { });
    })
    .catch(error => {
      net.connect({ host, port }, function () {
        this.write(msg.slice(i));
        duplex.on('error', () => { }).pipe(this).on('error', () => { }).pipe(duplex);
      }).on('error', () => { });
    });

  return true;
}

// Tro-jan处理
function handleTrojConnection(ws, msg) {
  try {
    if (msg.length < 58) return false;
    const receivedPasswordHash = msg.slice(0, 56).toString();
    const possiblePasswords = [UUID];

    let matchedPassword = null;
    for (const pwd of possiblePasswords) {
      const hash = crypto.createHash('sha224').update(pwd).digest('hex');
      if (hash === receivedPasswordHash) {
        matchedPassword = pwd;
        break;
      }
    }

    if (!matchedPassword) return false;
    let offset = 56;
    if (msg[offset] === 0x0d && msg[offset + 1] === 0x0a) {
      offset += 2;
    }

    const cmd = msg[offset];
    if (cmd !== 0x01) return false;
    offset += 1;
    const atyp = msg[offset];
    offset += 1;
    let host, port;
    if (atyp === 0x01) {
      host = msg.slice(offset, offset + 4).join('.');
      offset += 4;
    } else if (atyp === 0x03) {
      const hostLen = msg[offset];
      offset += 1;
      host = msg.slice(offset, offset + hostLen).toString();
      offset += hostLen;
    } else if (atyp === 0x04) {
      host = msg.slice(offset, offset + 16).reduce((s, b, i, a) =>
        (i % 2 ? s.concat(a.slice(i - 1, i + 1)) : s), [])
        .map(b => b.readUInt16BE(0).toString(16)).join(':');
      offset += 16;
    } else {
      return false;
    }

    port = msg.readUInt16BE(offset);
    offset += 2;

    if (offset < msg.length && msg[offset] === 0x0d && msg[offset + 1] === 0x0a) {
      offset += 2;
    }

    if (isBlockedDomain(host)) {
      ws.close();
      return false;
    }
    const duplex = createWebSocketStream(ws);
    resolveHost(host)
      .then(resolvedIP => {
        net.connect({ host: resolvedIP, port }, function () {
          if (offset < msg.length) {
            this.write(msg.slice(offset));
          }
          duplex.on('error', () => { }).pipe(this).on('error', () => { }).pipe(duplex);
        }).on('error', () => { });
      })
      .catch(error => {
        net.connect({ host, port }, function () {
          if (offset < msg.length) {
            this.write(msg.slice(offset));
          }
          duplex.on('error', () => { }).pipe(this).on('error', () => { }).pipe(duplex);
        }).on('error', () => { });
      });

    return true;
  } catch (error) {
    return false;
  }
}

// Ss处理
function handleSsConnection(ws, msg) {
  try {
    let offset = 0;
    const atyp = msg[offset];
    offset += 1;

    let host, port;
    if (atyp === 0x01) {
      host = msg.slice(offset, offset + 4).join('.');
      offset += 4;
    } else if (atyp === 0x03) {
      const hostLen = msg[offset];
      offset += 1;
      host = msg.slice(offset, offset + hostLen).toString();
      offset += hostLen;
    } else if (atyp === 0x04) {
      host = msg.slice(offset, offset + 16).reduce((s, b, i, a) =>
        (i % 2 ? s.concat(a.slice(i - 1, i + 1)) : s), [])
        .map(b => b.readUInt16BE(0).toString(16)).join(':');
      offset += 16;
    } else {
      return false;
    }

    port = msg.readUInt16BE(offset);
    offset += 2;

    if (isBlockedDomain(host)) {
      ws.close();
      return false;
    }
    const duplex = createWebSocketStream(ws);
    resolveHost(host)
      .then(resolvedIP => {
        net.connect({ host: resolvedIP, port }, function () {
          if (offset < msg.length) {
            this.write(msg.slice(offset));
          }
          duplex.on('error', () => { }).pipe(this).on('error', () => { }).pipe(duplex);
        }).on('error', () => { });
      })
      .catch(error => {
        net.connect({ host, port }, function () {
          if (offset < msg.length) {
            this.write(msg.slice(offset));
          }
          duplex.on('error', () => { }).pipe(this).on('error', () => { }).pipe(duplex);
        }).on('error', () => { });
      });

    return true;
  } catch (error) {
    return false;
  }
}

// Ws handler
const wss = new WebSocket.Server({ server: httpServer });
wss.on('connection', (ws, req) => {
  const url = req.url || '';
  console.log('WS conn:', url);

  const expectedPath = `/${WSPATH}`;
  if (!url.startsWith(expectedPath)) {
    ws.close();
    return;
  }

  ws.once('message', msg => {
    console.log('WS msg: len=' + msg.length + ' firstByte=' + msg[0]);
    // VLE-SS (version byte 0 + 16 bytes UUID)
    if (msg.length > 17 && msg[0] === 0) {
      const id = msg.slice(1, 17);
      const isVless = id.every((v, i) => v == parseInt(uuid.substr(i * 2, 2), 16));
      if (isVless) {
        if (!handleVlsConnection(ws, msg)) {
          ws.close();
        }
        return;
      }
    }
    // tro-jan (56 bytes SHA224 hash)
    if (msg.length >= 58) {
      if (handleTrojConnection(ws, msg)) {
        return;
      }
    }
    // SS (ATYP开头: 0x01, 0x03, 0x04)
    if (msg.length > 0 && (msg[0] === 0x01 || msg[0] === 0x03 || msg[0] === 0x04)) {
      if (handleSsConnection(ws, msg)) {
        return;
      }
    }

    ws.close();
  }).on('error', () => { });
});

const getDownloadUrl = () => {
  const arch = os.arch();
  if (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') {
    if (!NEZHA_PORT) {
      return 'https://arm64.ssss.nyc.mn/v1';
    } else {
      return 'https://arm64.ssss.nyc.mn/agent';
    }
  } else {
    if (!NEZHA_PORT) {
      return 'https://amd64.ssss.nyc.mn/v1';
    } else {
      return 'https://amd64.ssss.nyc.mn/agent';
    }
  }
};

const downloadFile = async () => {
  if (!NEZHA_SERVER && !NEZHA_KEY) return;

  try {
    const url = getDownloadUrl();
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'stream'
    });

    const writer = fs.createWriteStream('npm');
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log('npm download successfully');
        exec('chmod +x npm', (err) => {
          if (err) reject(err);
          resolve();
        });
      });
      writer.on('error', reject);
    });
  } catch (err) {
    throw err;
  }
};

const runnz = async () => {
  try {
    const status = execSync('ps aux | grep -v "grep" | grep "./[n]pm"', { encoding: 'utf-8' });
    if (status.trim() !== '') {
      console.log('npm is already running, skip running...');
      return;
    }
  } catch (e) {
    // 进程不存在时继续运行nezha
  }

  await downloadFile();
  let command = '';
  let tlsPorts = ['443', '8443', '2096', '2087', '2083', '2053'];
  if (NEZHA_SERVER && NEZHA_PORT && NEZHA_KEY) {
    const NEZHA_TLS = tlsPorts.includes(NEZHA_PORT) ? '--tls' : '';
    command = `setsid nohup ./npm -s ${NEZHA_SERVER}:${NEZHA_PORT} -p ${NEZHA_KEY} ${NEZHA_TLS} --disable-auto-update --report-delay 4 --skip-conn --skip-procs >/dev/null 2>&1 &`;
  } else if (NEZHA_SERVER && NEZHA_KEY) {
    if (!NEZHA_PORT) {
      const port = NEZHA_SERVER.includes(':') ? NEZHA_SERVER.split(':').pop() : '';
      const NZ_TLS = tlsPorts.includes(port) ? 'true' : 'false';
      const configYaml = `client_secret: ${NEZHA_KEY}
debug: false
disable_auto_update: true
disable_command_execute: false
disable_force_update: true
disable_nat: false
disable_send_query: false
gpu: false
insecure_tls: true
ip_report_period: 1800
report_delay: 4
server: ${NEZHA_SERVER}
skip_connection_count: true
skip_procs_count: true
temperature: false
tls: ${NZ_TLS}
use_gitee_to_upgrade: false
use_ipv6_country_code: false
uuid: ${UUID}`;

      fs.writeFileSync('config.yaml', configYaml);
    }
    command = `setsid nohup ./npm -c config.yaml >/dev/null 2>&1 &`;
  } else {
    // console.log('NEZHA variable is empty, skip running');
    return;
  }

  try {
    exec(command, { shell: '/bin/bash' }, (err) => {
      if (err) console.error('npm running error:', err);
      else console.log('npm is running');
    });
  } catch (error) {
    console.error(`error: ${error}`);
  }
};

async function addAccessTask() {
  if (!AUTO_ACCESS) return;

  if (!DOMAIN) {
    return;
  }
  const fullURL = `https://${DOMAIN}/${SUB_PATH}`;
  try {
    const res = await axios.post("https://oooo.serv00.net/add-url", {
      url: fullURL
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    console.log('Automatic Access Task added successfully');
  } catch (error) {
    // console.error('Error adding Task:', error.message);
  }
}

const delFiles = () => {
  ['npm', 'config.yaml'].forEach(file => fs.unlink(file, () => { }));
};

httpServer.listen(PORT, () => {
  runnz();
  setTimeout(() => {
    delFiles();
  }, 180000);
  addAccessTask();
  console.log(`Server is running on port ${PORT}`);
});
