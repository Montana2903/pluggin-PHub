const URL_BASE = "https://www.pornhub.com";
const PLATFORM_CLAIMTYPE = 3;
const PLATFORM = "PornHub";

var config = {};
var state = {
	token: "",
	sessionCookie: ""
};

var headers = {
	"Cookie": "platform=pc; accessAgeDisclaimerPH=2",
	"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0",
	"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
	"Accept-Language": "en-US,en;q=0.5",
	"Cache-Control": "no-cache",
	"Upgrade-Insecure-Requests": "1"
};

/**
 * Helpers base
 */
function safeString(value) {
	return (value === undefined || value === null) ? "" : String(value).trim();
}

function safeArray(value) {
	return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
	return safeString(value).replace(/\s+/g, " ").trim();
}

function buildQuery(params) {
	const query = [];
	for (const [key, value] of Object.entries(params || {})) {
		if (value === undefined || value === null || value === "") continue;
		query.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
	}
	return query.length > 0 ? `?${query.join("&")}` : "";
}

function selectedFilterValue(filters, id) {
	if (!filters || !(id in filters)) return "";
	const values = Array.isArray(filters[id]) ? filters[id] : [filters[id]];
	return values.length > 0 ? String(values[0] ?? "") : "";
}

function absolutePlatformUrl(url) {
	if (!url) return "";
	if (url.startsWith("//")) return "https:" + url;
	if (url.startsWith("/")) return URL_BASE + url;
	if (/^https?:\/\//i.test(url)) return url;
	return URL_BASE + (url.startsWith("/") ? url : "/" + url);
}

function imageUrl(element) {
	if (!element) return "";

	const attributes = [
		"data-src",
		"data-thumb_url",
		"data-mediumthumb",
		"data-image",
		"data-path",
		"src"
	];

	for (const attribute of attributes) {
		let value = element.getAttribute(attribute);
		if (!value || value.startsWith("data:image/")) continue;
		value = value.replace(/&amp;/g, "&");

		if (value.startsWith("//")) return "https:" + value;
		if (value.startsWith("/")) return URL_BASE + value;
		if (/^https?:\/\//i.test(value)) return value;

		if (value) return value;
	}

	return "";
}

function parseInteractionCount(value) {
	if (typeof value === "number") {
		return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
	}

	if (typeof value !== "string") return 0;

	const normalized = value.trim().replace(/,/g, "");
	const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)\s*([KMB])?$/i);

	if (!match) return 0;

	const multiplier = {
		K: 1e3,
		M: 1e6,
		B: 1e9
	}[(match[2] || "").toUpperCase()] || 1;

	const parsed = Number.parseFloat(match[1]) * multiplier;
	return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function interactionCountFromLdJson(ldJson) {
	const rawStatistics = ldJson && ldJson.interactionStatistic;
	const statistics = Array.isArray(rawStatistics) ? rawStatistics : [rawStatistics];

	const statistic = statistics.find(item =>
		item && item.userInteractionCount !== undefined && item.userInteractionCount !== null
	);

	return parseInteractionCount(statistic ? statistic.userInteractionCount : 0);
}

function parseStringWithKorMSuffixes(subscriberString) {
	if (!subscriberString) return 0;
	const str = String(subscriberString).trim();
	if (!str) return 0;

	const match = str.match(/^([0-9]+(?:[.,][0-9]+)?)([KMB])?$/i);
	if (!match) {
		const numeric = parseFloat(str.replace(/[^0-9.]/g, ""));
		if (Number.isFinite(numeric)) {
			if (str.toUpperCase().includes("K")) return Math.floor(numeric * 1000);
			if (str.toUpperCase().includes("M")) return Math.floor(numeric * 1000000);
			if (str.toUpperCase().includes("B")) return Math.floor(numeric * 1000000000);
			return Math.floor(numeric);
		}
		return 0;
	}

	const value = parseFloat(match[1].replace(",", "."));
	const suffix = (match[2] || "").toUpperCase();

	if (suffix === "K") return Math.floor(value * 1000);
	if (suffix === "M") return Math.floor(value * 1000000);
	if (suffix === "B") return Math.floor(value * 1000000000);
	return Math.floor(value);
}

function parseNumberSuffix(str) {
	return parseStringWithKorMSuffixes(str);
}

function parseDuration(durationStr) {
	if (!durationStr) return 0;
	const parts = String(durationStr).split(':').map(Number);
	if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
	if (parts.length === 2) return parts[0] * 60 + parts[1];
	return parts[0] || 0;
}

function extractThumbnail(liNode) {
	if (!liNode) return "";

	const candidates = [
		liNode.querySelector(".phimage"),
		liNode.querySelector("a.js-linkVideoThumb, a.thumbnailTitle"),
		liNode.querySelector("img"),
		liNode
	];

	const attrs = [
		"data-image",
		"data-thumb_url",
		"data-mediumthumb",
		"data-src",
		"data-path",
		"src"
	];

	for (const node of candidates) {
		if (!node) continue;

		for (const attr of attrs) {
			let value = node.getAttribute(attr);
			if (!value || value.startsWith("data:image/")) continue;
			value = value.replace(/&amp;/g, "&");

			if (value.startsWith("//")) return "https:" + value;
			if (value.startsWith("/")) return URL_BASE + value;
			if (/^https?:\/\//i.test(value)) return value;
			if (value) return value;
		}
	}

	return "";
}

function safeJsonParse(raw, fallback = null) {
	if (!raw) return fallback;
	try {
		return JSON.parse(raw);
	} catch (e) {
		log("safeJsonParse error: " + e);
		return fallback;
	}
}

function log(message) {
	try {
		console.log("[PornHubPlugin]", message);
	} catch (e) {}
}

/**
 * Grayjay plugin lifecycle
 */
source.enable = function (conf, settings, savedStateStr) {
	config = conf || {};

	if (savedStateStr) {
		try {
			const parsed = JSON.parse(savedStateStr);
			state = {
				...state,
				...parsed
			};
			log("State loaded: token=" + (state.token ? "present" : "empty"));
		} catch (e) {
			log("Failed to parse saved state: " + e);
			state = { token: "", sessionCookie: "" };
		}
	}
};

source.saveState = function () {
	try {
		return JSON.stringify(state);
	} catch (e) {
		log("Failed to save state: " + e);
		return JSON.stringify({ token: "", sessionCookie: "" });
	}
};

source.getHomeCapabilities = function() {
	return { types: [Type.Feed.Mixed], sorts: [Type.Order.Chronological], filters: [] };
};

source.getHome = function(type, filters) {
	return getVideoPager('/video', {}, 1);
};

source.searchSuggestions = function (query) {
	const q = safeString(query);
	if (!q) return [];

	try {
		const apiUrl = URL_BASE +
			"/api/v1/video/search_autocomplete?" +
			"pornstars=true&token=" + encodeURIComponent(state.token || "") +
			"&orientation=straight&q=" + encodeURIComponent(q) +
			"&alt=0";

		log("Fetching autocomplete: " + apiUrl);

		const json = httpGET(apiUrl, {
			headers: {
				"Cookie": headers["Cookie"],
				"User-Agent": headers["User-Agent"],
				"Accept": "*/*",
				"Accept-Language": "en-US,en;q=0.5",
				"Referer": URL_BASE + "/",
				"X-Requested-With": "XMLHttpRequest",
				"Content-Type": "application/x-www-form-urlencoded"
			},
			requireToken: true,
			parseJson: true,
			retries: 3
		});

		if (!json || typeof json !== "object") {
			log("Empty autocomplete JSON");
			return [];
		}

		const suggestions = [];

		if (Array.isArray(json.queries)) {
			for (const item of json.queries) {
				const value = safeString(item);
				if (value) suggestions.push(value);
			}
		}

		if (Array.isArray(json.models)) {
			for (const model of json.models) {
				const value = safeString(model);
				if (value) suggestions.push("@" + value);
			}
		}

		return [...new Set(suggestions)].slice(0, 12);
	} catch (e) {
		log("searchSuggestions error: " + e);
		return [];
	}
};

source.search = function (query, filters) {
	const q = safeString(query);
	if (!q) return new PornhubVideoPager([], false, "/video/search", { q }, 1);

	try {
		const params = {
			q: q,
			...filters
		};

		return getVideoPager("/video/search", params, 1);
	} catch (e) {
		log("search error: " + e);
		return new PornhubVideoPager([], false, "/video/search", { q }, 1);
	}
};

source.getSearchCapabilities = function () {
	return {
		types: [Type.Feed.Mixed],
		sorts: [Type.Order.Trending],
		filters: []
	};
};

/**
 * Pagers
 */
function getVideoPager(path, params, page) {
	try {
		const url = `${URL_BASE}${path}${buildQuery({ ...params, page })}`;
		log("getVideoPager: " + url);

		const html = httpGET(url, {
			headers: headers,
			requireToken: false,
			parseJson: false,
			retries: 3
		});

		if (!html) return new PornhubVideoPager([], false, path, params, page);

		const doc = new DOMParser().parseFromString(html, "text/html");
		const items = [];
		const nodes = doc.querySelectorAll("li.video, li.videos, .videoBox, .video-card, .phimage");

		for (const node of nodes) {
			const titleNode = node.querySelector("a[title], .title, h3, h2, span.title");
			const title = normalizeText(titleNode ? titleNode.textContent : "");

			const videoUrlNode = node.querySelector("a[href*='/view_video.php'], a[href*='/videos/'], a[href]");
			const href = videoUrlNode ? videoUrlNode.getAttribute("href") : "";

			const thumbnail = extractThumbnail(node);

			if (!title && !href) continue;

			const item = {
				id: href ? href.split("/").filter(Boolean).pop() : String(Math.random()),
				title: title || "Video",
				url: absolutePlatformUrl(href),
				image: thumbnail,
				duration: "N/A",
				type: "video"
			};

			items.push(item);
		}

		const hasMore = items.length >= 12;
		return new PornhubVideoPager(items, hasMore, path, params, page);
	} catch (e) {
		log("getVideoPager error: " + e);
		return new PornhubVideoPager([], false, path, params, page);
	}
}

function getChannelPager(path, params, page) {
	try {
		const url = `${URL_BASE}${path}${buildQuery({ ...params, page })}`;
		log("getChannelPager: " + url);

		const html = httpGET(url, {
			headers: headers,
			requireToken: false,
			parseJson: false,
			retries: 3
		});

		if (!html) return new PornhubChannelPager([], false, path, params, page);

		const doc = new DOMParser().parseFromString(html, "text/html");
		const results = [];
		const items = doc.querySelectorAll(".channel, .profile, .user-card, li.channel, li.pornstar");

		for (const itemNode of items) {
			const link = itemNode.querySelector("a[href]");
			const href = link ? link.getAttribute("href") : "";
			const title = normalizeText(itemNode.textContent || "");
			const image = extractThumbnail(itemNode);

			if (!href && !title) continue;

			results.push({
				id: href ? href.split("/").filter(Boolean).pop() : String(Math.random()),
				title: title || "Canal",
				url: absolutePlatformUrl(href),
				image: image,
				type: "channel"
			});
		}

		const hasMore = results.length >= 12;
		return new PornhubChannelPager(results, hasMore, path, params, page);
	} catch (e) {
		log("getChannelPager error: " + e);
		return new PornhubChannelPager([], false, path, params, page);
	}
}

function getCommentPager(path, params, page) {
	try {
		const url = `${URL_BASE}${path}${buildQuery({ ...params, page })}`;
		log("getCommentPager: " + url);

		const html = httpGET(url, {
			headers: headers,
			requireToken: false,
			parseJson: false,
			retries: 3
		});

		if (!html) return new PornhubCommentPager([], false, path, params, page);

		const doc = new DOMParser().parseFromString(html, "text/html");
		const results = [];
		const items = doc.querySelectorAll(".comment, .comment-item, .userComment");

		for (const itemNode of items) {
			const authorNode = itemNode.querySelector(".author, .commenter, .userName");
			const textNode = itemNode.querySelector(".commentText, .text, .body");
			const author = normalizeText(authorNode ? authorNode.textContent : "");
			const text = normalizeText(textNode ? textNode.textContent : "");

			if (!author && !text) continue;

			results.push({
				author: author || "Anónimo",
				text: text || "",
				timestamp: Date.now()
			});
		}

		const hasMore = results.length >= 12;
		return new PornhubCommentPager(results, hasMore, path, params, page);
	} catch (e) {
		log("getCommentPager error: " + e);
		return new PornhubCommentPager([], false, path, params, page);
	}
}

function getMultiChannelPager(query, page) {
	try {
		const params = { q: query, page };
		return getChannelPager("/channels/search", params, page);
	} catch (e) {
		log("getMultiChannelPager error: " + e);
		return new PornhubMultiChannelPager([], false, query, page);
	}
}

/**
 * Pager classes
 */
class PornhubVideoPager extends VideoPager {
	constructor(results, hasMore, path, params, page) { super(results, !!hasMore, { path, params, page }); }
	nextPage() { return getVideoPager(this.context.path, this.context.params, (this.context.page ?? 1) + 1); }
}

class PornhubChannelPager extends ChannelPager {
	constructor(results, hasMore, path, params, page) { super(results, !!hasMore, { path, params, page }); }
	nextPage() { return getChannelPager(this.context.path, this.context.params, (this.context.page ?? 1) + 1); }
}

class PornhubCommentPager extends CommentPager {
	constructor(results, hasMore, path, params, page) { super(results, !!hasMore, { path, params, page }); }
	nextPage() { return getCommentPager(this.context.path, this.context.params, (this.context.page ?? 1) + 1); }
}

class PornhubMultiChannelPager extends ChannelPager {
	constructor(results, hasMore, query, page) { super(results, !!hasMore, { query, page }); }
	nextPage() { return getMultiChannelPager(this.context.query, (this.context.page ?? 1) + 1); }
}
