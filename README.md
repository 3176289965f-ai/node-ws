<div align="center">

# Node-ws

基于 Node.js + WebSocket 的多协议代理：**vless / trojan / shadowsocks** 三协议，
Serverless 友好，轻量无内核。

本仓库是 [eooce/node-ws](https://github.com/eooce/node-ws) 的个人 fork，
已同步上游最新代码；`.github/workflows` 下的 Docker 构建流程为本 fork 自用，未同步。

---

Telegram 交流反馈群组（上游）：https://t.me/eooceu

</div>

## 功能

- vless / trojan / shadowsocks 三协议，WebSocket 传输
- 访问 `https://你的域名/订阅路径` 自动生成 base64 订阅链接
- 内置**伪装首页**：直接访问域名显示普通网页，不暴露代理特征
- **测速网站屏蔽**：speedtest 等测速域名不走代理，省流量、更低调
- 集成**哪吒探针**（支持 v0 / v1），可自行添加环境变量
- 可选**自动访问保活**（AUTO_ACCESS），防止 PaaS 平台休眠

## 部署

PaaS / 容器平台部署，设置以下环境变量：

| 变量名        | 是否必须 | 默认值 | 备注 |
| ------------ | ------ | ------ | ------ |
| UUID         | 否 | `5efabea4-f6d4-91fd-b8f0-17e004c89c60` | 开启了哪吒 v1 请务必修改 UUID |
| PORT         | 否 | `3000` | 监听端口 |
| DOMAIN       | 是 | | 项目域名或已反代的域名，不带 `https://` 前缀 |
| SUB_PATH     | 否 | `sub` | 订阅路径，即 `https://你的域名/sub` |
| SUB_PASSWORD | 否 | 空 | 订阅页访问密码；设置后浏览器打开页面需输密码，客户端订阅不受影响 |
| WSPATH       | 否 | UUID 前 8 位 | WebSocket 节点路径 |
| NAME         | 否 | | 节点名称前缀，例如 `MyNode` |
| NEZHA_SERVER | 否 | | 哪吒 v1 填写 `nz.abc.com:8008`，v0 填写 `nz.abc.com` |
| NEZHA_PORT   | 否 | | 哪吒 v1 没有此变量；v0 的 agent 端口 |
| NEZHA_KEY    | 否 | | 哪吒 v1 的 `NZ_CLIENT_SECRET`，或 v0 的 agent 密钥 |
| AUTO_ACCESS  | 否 | `false` | 是否开启自动访问保活，需同时填写 DOMAIN |

部署后访问 `https://你的域名/${SUB_PATH}`：
- 用**浏览器**打开 → 显示浅紫色订阅中心页面，可一键复制各协议链接；
- **客户端**（v2rayNG / Nekoray / Streisand 等）用该地址**订阅更新** → 自动获取原始 base64 订阅，不受影响。

> 提示：`README.md` 为说明文件，部署时不需要上传。

## 用 Cloudflare Workers / Snippets 反代套 CDN 加速

```js
export default {
    async fetch(request, env) {
        let url = new URL(request.url);
        if (url.pathname.startsWith('/')) {
            var arrStr = [
                'change.your.domain', // 此处单引号里填写你的节点域名
            ];
            url.protocol = 'https:'
            url.hostname = getRandomArray(arrStr)
            let new_request = new Request(url, request);
            return fetch(new_request);
        }
        return env.ASSETS.fetch(request);
    },
};
function getRandomArray(array) {
  const randomIndex = Math.floor(Math.random() * array.length);
  return array[randomIndex];
}
```

## 开源协议

本项目遵循 **GNU GPL-3.0** 协议，fork 自 `eooce/node-ws`，保留原作者信息。
修改后的版本同样以 GPL-3.0 开源。
