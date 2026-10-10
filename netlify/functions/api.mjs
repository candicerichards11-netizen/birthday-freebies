import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";

const STORE = getStore("birthday-freebies-site");
const SESSION_COOKIE = "birthday_owner";
const SESSION_SECONDS = 60 * 60 * 8;
const CATEGORIES = new Set([
  "🏔️ Attractions",
  "🍽️ Food & Drink",
  "🍷 Wine Farms",
  "🎬 Cinema",
  "💄 Beauty & Retail",
  "💆 Wellness"
]);
const DEFAULT_SETTINGS = {
  contact: { phone: "", email: "", whatsapp: "", businessName: "", location: "" },
  social: { instagram: "", facebook: "", tiktok: "", otherLinks: [] },
  ads: { publisherId: "", slotId: "", enabled: false }
};

export const config = { path: "/api/*" };

function respond(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}

function cleanText(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanHttpsUrl(value, label, optional = true) {
  const input = cleanText(value, 500);
  if (!input && optional) return "";
  let parsed;
  try { parsed = new URL(input); } catch { throw new Error(`${label} must be a valid HTTPS link.`); }
  if (parsed.protocol !== "https:") throw new Error(`${label} must start with https://.`);
  return parsed.href;
}

function normalizeSettings(input = {}) {
  const contact = input.contact || {};
  const social = input.social || {};
  const ads = input.ads || {};
  const email = cleanText(contact.email, 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid contact email address.");

  const publisherId = cleanText(ads.publisherId, 30);
  const slotId = cleanText(ads.slotId, 30);
  if (publisherId && !/^ca-pub-\d{16}$/.test(publisherId)) throw new Error("AdSense publisher ID must look like ca-pub- followed by 16 digits.");
  if (slotId && !/^\d+$/.test(slotId)) throw new Error("Ad unit slot ID must contain digits only.");
  if (ads.enabled && (!publisherId || !slotId)) throw new Error("Add a valid publisher ID and ad slot ID before enabling the banner.");

  const otherLinks = Array.isArray(social.otherLinks) ? social.otherLinks.slice(0, 10).map(item => ({
    label: cleanText(item?.label, 60),
    url: cleanHttpsUrl(item?.url, "Other link")
  })).filter(item => item.label && item.url) : [];

  return {
    contact: {
      phone: cleanText(contact.phone, 40),
      email,
      whatsapp: cleanText(contact.whatsapp, 40),
      businessName: cleanText(contact.businessName, 100),
      location: cleanText(contact.location, 120)
    },
    social: {
      instagram: cleanHttpsUrl(social.instagram, "Instagram URL"),
      facebook: cleanHttpsUrl(social.facebook, "Facebook URL"),
      tiktok: cleanHttpsUrl(social.tiktok, "TikTok URL"),
      otherLinks
    },
    ads: { publisherId, slotId, enabled: !!ads.enabled }
  };
}

function normalizeFreebies(value) {
  if (!Array.isArray(value) || value.length > 200) throw new Error("Freebies must be a list of 200 items or fewer.");
  const seen = new Set();
  return value.map(item => {
    if (!item || typeof item !== "object") throw new Error("Each freebie needs valid details.");
    const id = cleanText(item.id, 100);
    if (!/^[a-z0-9_-]+$/.test(id) || seen.has(id)) throw new Error("Freebie IDs must be unique and use letters, numbers, dashes or underscores.");
    seen.add(id);
    const cat = cleanText(item.cat, 80);
    if (!CATEGORIES.has(cat)) throw new Error("Choose one of the listed freebie categories.");
    const name = cleanText(item.name, 100);
    const freebie = cleanText(item.freebie, 160);
    const validity = cleanText(item.validity, 120);
    const how = cleanText(item.how, 1200);
    if (!name || !freebie || !validity || !how) throw new Error("Name, offer, validity and claim instructions are required.");
    return {
      id, cat, name, freebie, validity, how,
      takeaway: !!item.takeaway,
      priority: item.priority === "high" ? "high" : "medium",
      isNew: !!item.isNew,
      affiliateUrl: cleanHttpsUrl(item.affiliateUrl, "Partner / affiliate URL")
    };
  });
}

async function readSite() {
  const site = await STORE.get("site-content", { type: "json" });
  return site || { freebies: null, settings: DEFAULT_SETTINGS, updatedAt: null };
}

function ownerPassword() {
  return typeof process.env.OWNER_PASSWORD === "string" ? process.env.OWNER_PASSWORD : "";
}

function signature(expiry, password) {
  return createHmac("sha256", password).update(`birthday-owner:${expiry}`).digest("hex");
}

function validSession(request) {
  const password = ownerPassword();
  if (password.length < 16) return false;
  const cookieHeader = request.headers.get("cookie") || "";
  const raw = cookieHeader.split(";").map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE}=`));
  if (!raw) return false;
  const [expiryText, supplied] = decodeURIComponent(raw.slice(SESSION_COOKIE.length + 1)).split(".");
  const expiry = Number(expiryText);
  if (!Number.isInteger(expiry) || expiry < Math.floor(Date.now() / 1000) || !/^[a-f0-9]{64}$/.test(supplied || "")) return false;
  const expected = signature(expiryText, password);
  return timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"));
}

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

async function readJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 1_500_000) throw new Error("The submitted data is too large.");
  return request.json();
}

export default async function handler(request) {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  const endpoint = path.split("/").pop();
  const method = request.method.toUpperCase();

  if (method === "GET" && endpoint === "site") {
    try { return respond(await readSite()); }
    catch { return respond({ error: "Site data is temporarily unavailable." }, 503); }
  }

  if (!sameOrigin(request)) return respond({ error: "Cross-site requests are not accepted." }, 403);

  if (method === "POST" && endpoint === "login") {
    const password = ownerPassword();
    if (password.length < 16) return respond({ error: "Owner sign-in is not configured yet. Set OWNER_PASSWORD in Netlify site environment variables." }, 503);
    let body;
    try { body = await readJson(request); } catch { return respond({ error: "Enter your owner password." }, 400); }
    const supplied = typeof body?.password === "string" ? body.password : "";
    const suppliedHash = createHash("sha256").update(supplied).digest();
    const expectedHash = createHash("sha256").update(password).digest();
    if (!timingSafeEqual(suppliedHash, expectedHash)) return respond({ error: "The password is not correct." }, 401);
    const expiry = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
    const token = `${expiry}.${signature(expiry, password)}`;
    return respond({ ok: true }, 200, {
      "set-cookie": `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`
    });
  }

  if (method === "POST" && endpoint === "logout") {
    return respond({ ok: true }, 200, {
      "set-cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
    });
  }

  if (endpoint === "owner" && !validSession(request)) return respond({ error: "Sign in to the Owner Panel." }, 401);

  if (method === "GET" && endpoint === "owner") {
    try { return respond(await readSite()); }
    catch { return respond({ error: "Could not load saved site data." }, 503); }
  }

  if (method === "PUT" && endpoint === "owner") {
    try {
      const body = await readJson(request);
      const site = {
        freebies: normalizeFreebies(body?.freebies),
        settings: normalizeSettings(body?.settings),
        updatedAt: new Date().toISOString()
      };
      await STORE.setJSON("site-content", site);
      return respond(site);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save site data.";
      return respond({ error: message }, 400);
    }
  }

  return respond({ error: "Not found." }, 404);
}
