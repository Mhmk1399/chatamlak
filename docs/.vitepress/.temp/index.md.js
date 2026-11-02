import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"","description":"","frontmatter":{"layout":"home","hero":{"name":"Songbird","text":"Self-hosted chat","tagline":"A secure, lightweight chat platform designed to empower digital freedom worldwide.","image":{"src":"/songbird-hero.svg","alt":"Songbird"},"actions":[{"theme":"brand","text":"Get Started","link":"/Deployment-Script"},{"theme":"alt","text":"View on GitHub","link":"https://github.com/bllackbull/Songbird"}]},"features":[{"icon":"💬","title":"Drafts & Voice Playback","details":"Keep text drafts and queued messages on your device, and control voice message speed and playback position.","link":"/Chat-Features"},{"icon":"🚀","title":"Easy Install","details":"One-line deployment script handles dependencies, build, Nginx, and SSL for you.","link":"/Deployment-Script"},{"icon":"🐳","title":"Docker Ready","details":"Official ready-to-use Docker images and Docker Compose setup for fast, scalable deployment anywhere.","link":"/Installation-Docker"},{"icon":"🛡️","title":"Admin Panel","details":"Comprehensive management interface for users, chats, settings, and system operations.","link":"/Admin-Panel"},{"icon":"🔧","title":"Configurable","details":"Tune ports, uploads, retention, push, and more through environment variables or admin UI.","link":"/Environment-Variables"},{"icon":"☁️","title":"Object Storage & Media Worker","details":"Pluggable S3-compatible cloud storage, standalone HTTP push media transcoding worker, and CDN support.","link":"/Object-Storage"},{"icon":"📡","title":"Remote Channels","details":"Mirror Telegram channels or other Songbird channels into your own channels.","link":"/Remote-Channel-Setup"},{"icon":"📞","title":"Voice & Video Calls","details":"Real-time peer-to-peer voice and video calling powered by WebRTC with low-latency signaling.","link":"/Voice-Video-Calls"},{"icon":"🩺","title":"Troubleshooting","details":"Diagnose DNS, network, push, and deployment issues with practical guides.","link":"/Troubleshooting"}]},"headers":[],"relativePath":"index.md","filePath":"index.md","lastUpdated":null}');
const _sfc_main = { name: "index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
