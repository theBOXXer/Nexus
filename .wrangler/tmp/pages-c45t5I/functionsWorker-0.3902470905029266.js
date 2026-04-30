var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// api/[[route]].ts
function base64urlEncode(data) {
  const bytes = new Uint8Array(data);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(base64urlEncode, "base64urlEncode");
function base64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
__name(base64urlDecode, "base64urlDecode");
async function signJWT(payload, secret) {
  const enc = new TextEncoder();
  const now = Math.floor(Date.now() / 1e3);
  const full = { ...payload, iat: now, exp: now + 86400 * 7 };
  const header = { alg: "HS256", typ: "JWT" };
  const h = base64urlEncode(enc.encode(JSON.stringify(header)));
  const p = base64urlEncode(enc.encode(JSON.stringify(full)));
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${h}.${p}`));
  return `${h}.${p}.${base64urlEncode(sig)}`;
}
__name(signJWT, "signJWT");
async function verifyJWT(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token");
  const [h, p, s] = parts;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("HMAC", key, base64urlDecode(s), enc.encode(`${h}.${p}`));
  if (!valid) throw new Error("Invalid signature");
  const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(p)));
  if (payload.exp < Math.floor(Date.now() / 1e3)) throw new Error("Token expired");
  return payload;
}
__name(verifyJWT, "verifyJWT");
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 1e5, hash: "SHA-256" }, key, 256);
  const saltHex = [...salt].map((b) => b.toString(16).padStart(2, "0")).join("");
  const hashHex = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${saltHex}:${hashHex}`;
}
__name(hashPassword, "hashPassword");
async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map((b) => parseInt(b, 16)));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 1e5, hash: "SHA-256" }, key, 256);
  const computed = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return computed === hashHex;
}
__name(verifyPassword, "verifyPassword");
async function requireAuth(request, env) {
  const auth = request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) throw new Error("Missing token");
  const payload = await verifyJWT(auth.slice(7), env.JWT_SECRET);
  return { userId: payload.sub, email: payload.email };
}
__name(requireAuth, "requireAuth");
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(json, "json");
function error(message, status = 400) {
  return json({ error: message }, status);
}
__name(error, "error");
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};
async function handleAuthSignup(req, env) {
  const { email, password } = await req.json();
  if (!email || !password) return error("Email and password required");
  if (password.length < 6) return error("Password must be at least 6 characters");
  const id = crypto.randomUUID();
  const hash = await hashPassword(password);
  try {
    await env.DB.prepare("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)").bind(id, email.toLowerCase(), hash).run();
  } catch (e) {
    if (e instanceof Error && e.message?.includes("UNIQUE")) return error("Email already registered", 409);
    throw e;
  }
  const token = await signJWT({ sub: id, email: email.toLowerCase() }, env.JWT_SECRET);
  return json({ token, user: { id, email: email.toLowerCase() } });
}
__name(handleAuthSignup, "handleAuthSignup");
async function handleAuthSignin(req, env) {
  const { email, password } = await req.json();
  if (!email || !password) return error("Email and password required");
  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email.toLowerCase()).first();
  if (!user) return error("Invalid email or password", 401);
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return error("Invalid email or password", 401);
  const token = await signJWT({ sub: user.id, email: email.toLowerCase() }, env.JWT_SECRET);
  return json({ token, user: { id: user.id, email: email.toLowerCase() } });
}
__name(handleAuthSignin, "handleAuthSignin");
async function handleAuthMe(req, env) {
  const { userId, email } = await requireAuth(req, env);
  return json({ id: userId, email });
}
__name(handleAuthMe, "handleAuthMe");
async function listCategories(_req, env, userId) {
  const rows = await env.DB.prepare("SELECT * FROM categories WHERE user_id = ? ORDER BY position").bind(userId).all();
  return json(rows.results);
}
__name(listCategories, "listCategories");
async function createCategory(req, env, userId) {
  const id = crypto.randomUUID();
  const color = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#0ea5e9", "#3b82f6", "#ec4899", "#64748b"][Math.floor(Math.random() * 9)];
  await env.DB.prepare("INSERT INTO categories (id, user_id, name, color, position, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, userId, "New Category", color, 0, (/* @__PURE__ */ new Date()).toISOString()).run();
  const row = await env.DB.prepare("SELECT * FROM categories WHERE id = ?").bind(id).first();
  return json(row, 201);
}
__name(createCategory, "createCategory");
async function updateCategory(req, env, userId, catId) {
  const { name } = await req.json();
  if (!name) return error("Name required");
  const result = await env.DB.prepare("UPDATE categories SET name = ? WHERE id = ? AND user_id = ?").bind(name.trim(), catId, userId).run();
  if (result.changes === 0) return error("Not found", 404);
  return json({ success: true });
}
__name(updateCategory, "updateCategory");
async function deleteCategory(_req, env, userId, catId) {
  const result = await env.DB.prepare("DELETE FROM categories WHERE id = ? AND user_id = ?").bind(catId, userId).run();
  if (result.changes === 0) return error("Not found", 404);
  return json({ success: true });
}
__name(deleteCategory, "deleteCategory");
async function listChats(_req, env, userId) {
  const rows = await env.DB.prepare("SELECT * FROM chats WHERE user_id = ? ORDER BY updated_at DESC").bind(userId).all();
  return json(rows.results);
}
__name(listChats, "listChats");
async function createChat(req, env, userId) {
  const { category_id, title, model } = await req.json();
  const id = crypto.randomUUID();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await env.DB.prepare("INSERT INTO chats (id, user_id, category_id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, userId, category_id || null, title || "New Chat", model || "gpt-4o-mini", now, now).run();
  const row = await env.DB.prepare("SELECT * FROM chats WHERE id = ?").bind(id).first();
  return json(row, 201);
}
__name(createChat, "createChat");
async function updateChat(req, env, userId, chatId) {
  const body = await req.json();
  const allowed = ["title", "model", "archived", "category_id"];
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(body)) {
    if (allowed.includes(k)) {
      sets.push(`${k} = ?`);
      vals.push(k === "archived" ? v ? 1 : 0 : v);
    }
  }
  if (sets.length === 0) return error("No valid fields");
  vals.push(chatId, userId);
  const result = await env.DB.prepare(`UPDATE chats SET ${sets.join(", ")}, updated_at = ? WHERE id = ? AND user_id = ?`).bind(...vals.map((v) => v === void 0 ? null : v), (/* @__PURE__ */ new Date()).toISOString()).run();
  if (result.changes === 0) return error("Not found", 404);
  return json({ success: true });
}
__name(updateChat, "updateChat");
async function deleteChat(_req, env, userId, chatId) {
  const result = await env.DB.prepare("DELETE FROM chats WHERE id = ? AND user_id = ?").bind(chatId, userId).run();
  if (result.changes === 0) return error("Not found", 404);
  return json({ success: true });
}
__name(deleteChat, "deleteChat");
async function listMessages(req, env, userId) {
  const url = new URL(req.url);
  const chatId = url.searchParams.get("chat_id");
  if (!chatId) return error("chat_id required");
  const chat = await env.DB.prepare("SELECT id FROM chats WHERE id = ? AND user_id = ?").bind(chatId, userId).first();
  if (!chat) return error("Chat not found", 404);
  const rows = await env.DB.prepare("SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC").bind(chatId).all();
  return json(rows.results);
}
__name(listMessages, "listMessages");
async function createMessage(req, env, userId) {
  const { chat_id, role, content, model } = await req.json();
  if (!chat_id || !content) return error("chat_id and content required");
  const chat = await env.DB.prepare("SELECT id FROM chats WHERE id = ? AND user_id = ?").bind(chat_id, userId).first();
  if (!chat) return error("Chat not found", 404);
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO messages (id, chat_id, user_id, role, content, model) VALUES (?, ?, ?, ?, ?, ?)").bind(id, chat_id, userId, role || "user", content, model || null).run();
  await env.DB.prepare("UPDATE chats SET updated_at = ? WHERE id = ?").bind((/* @__PURE__ */ new Date()).toISOString(), chat_id).run();
  const row = await env.DB.prepare("SELECT * FROM messages WHERE id = ?").bind(id).first();
  return json(row, 201);
}
__name(createMessage, "createMessage");
var MODEL_MAP = {
  "gpt-4o": "openai",
  "gpt-4o-mini": "openai",
  "gpt-4-turbo": "openai",
  "gpt-3.5-turbo": "openai",
  "claude-opus-4-5": "anthropic",
  "claude-sonnet-4-5": "anthropic",
  "claude-3-5-haiku-latest": "anthropic"
};
async function handleLLMChat(req, env) {
  const { model, messages } = await req.json();
  if (!model || !messages) return error("model and messages required");
  const provider = MODEL_MAP[model];
  if (!provider) return error(`Unsupported model: ${model}`);
  if (provider === "openai") {
    const key2 = env.OPENAI_API_KEY;
    if (!key2) return error("OPENAI_API_KEY not configured", 500);
    const res2 = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key2}` },
      body: JSON.stringify({ model, messages })
    });
    if (!res2.ok) return error(`OpenAI: ${await res2.text()}`, 502);
    const data2 = await res2.json();
    return json({ content: data2.choices[0].message.content });
  }
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return error("ANTHROPIC_API_KEY not configured", 500);
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  const nonSystem = messages.filter((m) => m.role !== "system");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 4096, system: system || void 0, messages: nonSystem })
  });
  if (!res.ok) return error(`Anthropic: ${await res.text()}`, 502);
  const data = await res.json();
  return json({ content: data.content[0].text });
}
__name(handleLLMChat, "handleLLMChat");
var onRequest = /* @__PURE__ */ __name(async (context) => {
  const { request, env } = context;
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, "");
  try {
    if (path === "/auth/signup" && request.method === "POST") {
      const res = await handleAuthSignup(request, env);
      for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
      return res;
    }
    if (path === "/auth/signin" && request.method === "POST") {
      const res = await handleAuthSignin(request, env);
      for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
      return res;
    }
    const { userId } = await requireAuth(request, env);
    if (path === "/auth/me" && request.method === "GET") {
      const res = await handleAuthMe(request, env);
      for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
      return res;
    }
    if (path === "/categories" && request.method === "GET") {
      const res = await listCategories(request, env, userId);
      for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
      return res;
    }
    if (path === "/categories" && request.method === "POST") {
      const res = await createCategory(request, env, userId);
      for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
      return res;
    }
    const catMatch = path.match(/^\/categories\/(.+)$/);
    if (catMatch) {
      const catId = catMatch[1];
      if (request.method === "PUT") {
        const res = await updateCategory(request, env, userId, catId);
        for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
        return res;
      }
      if (request.method === "DELETE") {
        const res = await deleteCategory(request, env, userId, catId);
        for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
        return res;
      }
    }
    if (path === "/chats" && request.method === "GET") {
      const res = await listChats(request, env, userId);
      for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
      return res;
    }
    if (path === "/chats" && request.method === "POST") {
      const res = await createChat(request, env, userId);
      for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
      return res;
    }
    const chatMatch = path.match(/^\/chats\/(.+)$/);
    if (chatMatch) {
      const chatId = chatMatch[1];
      if (request.method === "PUT") {
        const res = await updateChat(request, env, userId, chatId);
        for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
        return res;
      }
      if (request.method === "DELETE") {
        const res = await deleteChat(request, env, userId, chatId);
        for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
        return res;
      }
    }
    if (path === "/messages" && request.method === "GET") {
      const res = await listMessages(request, env, userId);
      for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
      return res;
    }
    if (path === "/messages" && request.method === "POST") {
      const res = await createMessage(request, env, userId);
      for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
      return res;
    }
    if (path === "/llm-chat" && request.method === "POST") {
      const res = await handleLLMChat(request, env);
      for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
      return res;
    }
    return error("Not found", 404);
  } catch (e) {
    if (e instanceof Error && (e.message === "Missing token" || e.message === "Invalid token" || e.message === "Invalid signature" || e.message === "Token expired")) {
      return error("Unauthorized", 401);
    }
    console.error(e);
    return error(e instanceof Error ? e.message : "Internal error", 500);
  }
}, "onRequest");

// ../.wrangler/tmp/pages-c45t5I/functionsRoutes-0.6943688240767831.mjs
var routes = [
  {
    routePath: "/api/:route*",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest]
  }
];

// ../../../../Users/aaron/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../../../../Users/aaron/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error2) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error2;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
