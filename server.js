// Compatibility shim.
// The real server is server.cjs (CommonJS). package.json is `type: module`,
// so this .js file is ESM — it simply boots the CommonJS server. This keeps
// a Render "Start Command" of `node server.js` working after the rename.
import './server.cjs';
