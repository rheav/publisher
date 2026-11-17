// Swaps the image of the EasyPanel service `publisher` and deploys it. Runs INSIDE the easypanel container (it reads the
// API token from the panel's own LMDB and never prints it):
//   ssh vps 'c=$(docker ps -q -f label=com.docker.swarm.service.name=easypanel | head -1); \
//     docker exec -i $c sh -c "cat > /tmp/ep.js" && docker exec $c node /tmp/ep.js swap ghcr.io/rheav/trypost:<tag>; \
//     docker exec $c rm -f /tmp/ep.js' < scripts/easypanel-image.js
// `inspect` only reads. updateSourceImage wants username/password as strings ("" when the image is public), and the
// deploy is sent only when the service reads back the new image.
const fs = require("fs"), path = require("path");
const find = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (!e.isDirectory()) continue;
    if (e.name === "lmdb" && p.includes("node_modules/lmdb") && fs.existsSync(path.join(p, "package.json"))) return p;
    if (!e.name.startsWith(".") && p.split("/").length < 9) { const r = find(p); if (r) return r; }
  }
};
const db = require(find("/app/node_modules/.pnpm")).open({ path: "/etc/easypanel/data", readOnly: true, noSubdir: false });
let token;
for (const { value } of db.getRange({ start: "users:", end: "users:~" })) {
  const v = typeof value === "string" ? JSON.parse(value) : value;
  if (v?.json?.apiToken) { token = v.json.apiToken; break; }
}
if (!token) { console.log("no token"); process.exit(1); }
const base = "http://127.0.0.1:3000/api/trpc/", auth = { Authorization: "Bearer " + token };
const get = async (p, input) => { const r = await fetch(base + p + "?input=" + encodeURIComponent(JSON.stringify({ json: input })), { headers: auth }); const b = await r.json(); return { status: r.status, body: b.result?.data?.json ?? b.json ?? b }; };
const post = async (p, input) => { const r = await fetch(base + p, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ json: input }) }); return { status: r.status, body: (await r.text()).slice(0, 300) }; };
const svc = { projectName: "my-projects", serviceName: "publisher" };
(async () => {
  const s = await get("services.app.inspectService", svc);
  console.log("inspect", s.status, JSON.stringify({ image: s.body?.source?.image, replicas: s.body?.deploy?.replicas }));
  if (process.argv[2] !== "swap") return;
  const image = process.argv[3];
  const u = await post("services.app.updateSourceImage", { ...svc, image, username: s.body?.source?.username ?? "", password: s.body?.source?.password ?? "" });
  console.log("updateSourceImage", u.status);
  const after = await get("services.app.inspectService", svc);
  console.log("image now", after.body?.source?.image);
  if (u.status !== 200 || after.body?.source?.image !== image) { console.log("not deploying: the image did not change"); return; }
  console.log("deployService", (await post("services.app.deployService", svc)).status);
})();
