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
	"Accept-Language": "es-419,es;q=0.9,en-US;q=0.8,en;q=0.7",
	"Cache-Control": "no-cache",
	"Upgrade-Insecure-Requests": "1"
};

function buildQuery(params) {
	let query = "";
	let first = true;
	for (const [key, value] of Object.entries(params || {})) {
		if (value !== undefined && value !== null && value !== "") {
			if (first) {
				first = false;
			} else {
				query += "&";
			}
			query += `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
		}
	}
	return (query && query.length > 0) ? `?${query}` : "";
}

function selectedFilterValue(filters, id) {
	if (!filters || !filters[id]) return "";
	const values = Array.isArray(filters[id]) ? filters[id] : [filters[id]];
	return values.length > 0 ? String(values[0] ?? "") : "";
}

function absolutePlatformUrl(url) {
	if (!url) return "";
	if (url.startsWith("//")) return "https:" + url;
	if (/^https?:\/\//i.test(url)) return normalizePornhubUrl(url);
	return URL_BASE + (url.startsWith("/") ? url : "/" + url);
}

function imageUrl(element) {
	if (!element) return "";
	const attributes = [
		"data-src",
		"data-thumb_url",
		"data-mediumthumb",
		"data-image",
		"data-thumb",
		"data-poster",
		"data-path",
		"src"
	];

	for (const attribute of attributes) {
		let value = element.getAttribute(attribute);
		if (!value || value.startsWith("data:image/") || value.includes("1x1.gif") || value.includes("blank.gif")) continue;

		value = value.replace(/&amp;/g, "&");
		if (value.startsWith("//")) return "https:" + value;
		if (value.startsWith("/")) return URL_BASE + value;
		return value;
	}
	return "";
}

function extractThumbnail(liNode) {
	if (!liNode) return "";

	const targets = [
		liNode.querySelector('.phimage'),
		liNode.querySelector('a.js-linkVideoThumb, a.thumbnailTitle'),
		liNode.querySelector('img'),
		liNode
	];

	const attributes = [
		"data-image", "data-thumb_url", "data-src",
		"data-mediumthumb", "data-thumb", "data-poster",
		"data-path", "src"
	];

	for (let i = 0; i < targets.length; i++) {
		if (!targets[i]) continue;
		for (let j = 0; j < attributes.length; j++) {
			let val = targets[i].getAttribute(attributes[j]);
			if (val && !val.startsWith("data:image/") && !val.includes("1x1.gif") && !val.includes("blank.gif")) {
				return absolutePlatformUrl(val.replace(/&amp;/g, "&"));
			}
		}
	}

	const bgElements = [liNode.querySelector('.phimage'), liNode];
	for (let i = 0; i < bgElements.length; i++) {
		if (!bgElements[i]) continue;
		let style = bgElements[i].getAttribute("style") || "";
		let match = style.match(/url\(['"]?(.*?)['"]?\)/);
		if (match && match[1] && !match[1].includes("1x1.gif") && !match[1].includes("blank.gif")) {
			return absolutePlatformUrl(match[1]);
		}
	}

	const html = liNode.innerHTML || "";
	const regexMatch = html.match(/(?:data-image|data-src|data-thumb_url|src)=['"]([^'"]*\.(?:jpg|jpeg|png|webp)[^'"]*)['"]/i);
	if (regexMatch && regexMatch[1] && !regexMatch[1].includes("1x1.gif") && !regexMatch[1].startsWith("data:image/")) {
		return absolutePlatformUrl(regexMatch[1].replace(/&amp;/g, "&"));
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
	const multiplier = { K: 1e3, M: 1e6, B: 1e9 }[(match[2] || "").toUpperCase()] || 1;
	const parsed = Number.parseFloat(match[1]) * multiplier;
	return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function interactionCountFromLdJson(ldJson) {
	const rawStatistics = ldJson && ldJson.interactionStatistic;
	const statistics = Array.isArray(rawStatistics) ? rawStatistics : [rawStatistics];
	const statistic = statistics.find(item =>
		item && item.userInteractionCount !== undefined && item.userInteractionCount !== null);
	return parseInteractionCount(statistic ? statistic.userInteractionCount : 0);
}

function parseStringWithKorMSuffixes(subscriberString) {
	if (!subscriberString) return 0;
	const numericPart = parseFloat(String(subscriberString).replace(/,/g, ''));
	if (String(subscriberString).toUpperCase().includes("K")) return Math.floor(numericPart * 1000);
	else if (String(subscriberString).toUpperCase().includes("M")) return Math.floor(numericPart * 1000000);
	else return Math.floor(numericPart);
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

source.enable = function(conf, settings, savedStateStr) {
	config = conf ?? {};
	if (savedStateStr) {
		try {
			state = JSON.parse(savedStateStr);
			log("State loaded: token=" + (state.token ? "present" : "empty"));
		} catch (e) {
			log("Failed to parse saved state: " + e);
		}
	}
};

source.saveState = function() {
	return JSON.stringify(state);
};

source.getHomeCapabilities = function() {
	return {
		types: [Type.Feed.Mixed],
		sorts: [Type.Order.Chronological],
		filters: [
			{ id: "category", type: "DropdownFilter", name: "Categoría", isMultiSelect: false, options: [
				{ id: "", name: "Inicio" },
				{ id: "ht", name: "Hot" },
				{ id: "mv", name: "Más Vistos" },
				{ id: "tr", name: "Mejor Valorados" }
			], defaultOption: "" }
		]
	};
};

source.getHome = function(type, filters) {
	var params = {};
	if (filters) {
		var cat = selectedFilterValue(filters, "category");
		if (cat) params.o = cat;
	}
	return getVideoPager('/video', params, 1);
};

source.searchSuggestions = function(query) {
	if (query.length < 1) return [];
	try {
		var apiUrl = URL_BASE + "/api/v1/video/search_autocomplete?pornstars=true&token=" + state.token + "&orientation=straight&q=" + encodeURIComponent(query) + "&alt=0";
		var json = httpGET(apiUrl, {
			headers: {
				"Cookie": headers["Cookie"],
				"User-Agent": headers["User-Agent"],
				"Accept": "*/*",
				"Accept-Language": "es-419,es;q=0.9,en-US;q=0.8,en;q=0.7",
				"Referer": URL_BASE + "/",
				"X-Requested-With": "XMLHttpRequest",
				"Content-Type": "application/x-www-form-urlencoded"
			},
			requireToken: true,
			parseJson: true,
			retries: 3
		});
		if (!json || json.length === 0) return [];
		var suggestions = [];
		if (json.queries && Array.isArray(json.queries)) suggestions = suggestions.concat(json.queries);
		if (json.models && Array.isArray(json.models)) json.models.forEach(model => suggestions.push("@" + model.name));
		if (json.pornstars && Array.isArray(json.pornstars)) json.pornstars.forEach(pornstar => suggestions.push("@" + pornstar.name));
		if (json.channels && Array.isArray(json.channels)) json.channels.forEach(channel => suggestions.push("#" + channel.name));
		return suggestions;
	} catch (e) {
		return [];
	}
};

source.getSearchCapabilities = () => {
	return {
		types: [Type.Feed.Mixed],
		sorts: [Type.Order.Chronological, "Vistas", "Valoración"],
		filters: [
			{ id: "duration", type: "DropdownFilter", name: "Duración", isMultiSelect: false, options: [
				{ id: "", name: "Cualquiera" },
				{ id: "10", name: "Hasta 10 minutos" },
				{ id: "20", name: "Hasta 20 minutos" },
				{ id: "30", name: "Más de 20 minutos" }
			], defaultOption: "" },
			{ id: "quality", type: "DropdownFilter", name: "Calidad", isMultiSelect: false, options: [
				{ id: "", name: "Todas" },
				{ id: "hd", name: "HD" }
			], defaultOption: "" }
		]
	};
};

source.search = function(query, type, order, filters) {
	const params = {};
	if (query) params.search = query;
	const duration = selectedFilterValue(filters, "duration");
	if (duration) params.min_duration = duration;
	const quality = selectedFilterValue(filters, "quality");
	if (quality === "hd") params.hd = "1";

	if (order === Type.Order.Chronological) params.o = "mr";
	else if (order === "Vistas") params.o = "mv";
	else if (order === "Valoración") params.o = "tr";

	return getVideoPager(query ? "/video/search" : "/video", params, 1);
};

source.getSearchChannelContentsCapabilities = function() {
	return { types: [Type.Feed.Mixed], sorts: [Type.Order.Chronological], filters: [] };
};

source.searchChannelContents = function(channelUrl, query, type, order, filters) {
	let url = normalizePornhubUrl(channelUrl);
	let basePath = url.includes("/channels/") ? "/videos" : "/videos/upload";
	return getChannelVideosPager(url + basePath, { search: query }, 1);
};

source.searchChannels = function(query) {
	return getAutocompleteChannelPager(query);
};

source.isChannelUrl = function(url) {
	return url.includes(".pornhub.com/model/") || url.includes(".pornhub.com/channels/") || url.includes(".pornhub.com/pornstar/");
};

source.getChannel = function(url) {
	if (!url.startsWith("htt")) url = URL_BASE + url;
	url = normalizePornhubUrl(url);
	var channelUrlName = url.split("/")[4];
	var info = url.includes("/channels/") ? getChannelInfo(url) : getPornstarInfo(url);
	return new PlatformChannel({
		id: new PlatformID(PLATFORM, channelUrlName, config.id, PLATFORM_CLAIMTYPE),
		name: info.channelName,
		thumbnail: info.channelThumbnail,
		banner: info.channelBanner,
		subscribers: info.channelSubscribers,
		description: info.channelDescription,
		url: info.channelUrl,
		links: info.channelLinks
	});
};

source.getChannelContents = function(url, type, order, filters) {
	url = normalizePornhubUrl(url);
	if (url.includes("/channels/")) return getChannelVideosPager(url + "/videos", {}, 1);
	else if (url.includes("/model/")) return getModelVideosPager(url + "/videos", {}, 1);
	else return getPornstarVideosPager(url + "/videos/upload", {}, 1);
};

function playlistIdFromUrl(url) {
	if (!url) return "";
	var normalized = normalizePornhubUrl(String(url).trim());
	var relative = normalized;

	if (/^https?:\/\//i.test(normalized)) {
		if (!normalized.toLowerCase().startsWith(URL_BASE.toLowerCase() + "/")) return "";
		relative = normalized.substring(URL_BASE.length);
	}

	var pathMatch = relative.match(/^\/playlist\/(\d+)(?:[/?#]|$)/i);
	if (pathMatch) return pathMatch[1];

	if (/^\/playlist(?:[?#]|$)/i.test(relative)) {
		var queryMatch = relative.match(/[?&]id=(\d+)(?:[&#]|$)/i);
		if (queryMatch) return queryMatch[1];
	}

	var altMatch = relative.match(/[?&](?:list|playlist_id|playlistId)=(\d+)(?:[&#]|$)/i);
	if (altMatch) return altMatch[1];

	return "";
}

function playlistVideoFromParsed(video) {
	var authorInfo = video.authorInfo || {};
	var authorName = authorInfo.authorName || "";
	var authorUrl = absolutePlatformUrl(authorInfo.channel || "");
	return new PlatformVideo({
		id: new PlatformID(PLATFORM, String(video.id || video.videoUrl || ""), config.id),
		name: video.title || "",
		thumbnails: new Thumbnails([new Thumbnail(video.thumbnailUrl || "", 0)]),
		author: new PlatformAuthorLink(new PlatformID(PLATFORM, authorName || authorUrl || "PornHub", config.id), authorName || "PornHub", authorUrl, authorInfo.avatar || ""),
		datetime: undefined,
		duration: video.duration || 0,
		viewCount: video.views || 0,
		url: absolutePlatformUrl(video.videoUrl || ""),
		isLive: false
	});
}

function extractEmbeddedJsonArray(html, keys) {
	if (!html || typeof html !== "string") return [];
	var markers = keys || [];
	for (var i = 0; i < markers.length; i++) {
		var marker = markers[i];
		var idx = html.indexOf(marker);
		if (idx === -1) continue;

		var arrayStart = html.indexOf("[", idx);
		if (arrayStart === -1) continue;

		var depth = 0;
		var inString = false;
		var escapeNext = false;
		var foundEnd = false;

		for (var j = arrayStart; j < html.length; j++) {
			var ch = html[j];
			if (escapeNext) { escapeNext = false; continue; }
			if (ch === "\\") { escapeNext = true; continue; }
			if (ch === "\"" && !escapeNext) { inString = !inString; continue; }
			if (inString) continue;

			if (ch === "[") depth++;
			else if (ch === "]") {
				depth--;
				if (depth === 0) {
					var candidate = html.substring(arrayStart, j + 1);
					try {
						var parsed = JSON.parse(candidate);
						if (Array.isArray(parsed)) return parsed;
					} catch (e) {}
					foundEnd = true;
					break;
				}
			}
		}

		if (foundEnd) break;
	}
	return [];
}

function extractPlaylistVideosFromHtml(html) {
	if (!html || typeof html !== "string") return [];

	var dom = domParser.parseFromString(html, "text/html");
	var selectors = [
		"#videoPlaylist",
		".playlist-videos",
		"#playlistWrapper",
		".videoUList > ul",
		"ul.videos.full-row-thumbs",
		"ul.full-row-thumbs.videos",
		"#mostRecentVideosSection",
		"#moreData"
	];

	for (var s = 0; s < selectors.length; s++) {
		var node = dom.querySelector(selectors[s]);
		if (node && node.querySelectorAll("li.pcVideoListItem, li.video-item, li").length > 0) {
			var results = [];
			node.querySelectorAll("li.pcVideoListItem, li.video-item, li").forEach(function(li) {
				if (!li) return;
				var a = li.querySelector("a.js-linkVideoThumb, a.thumbnailTitle, a[href*='view_video']") || li.querySelector("a");
				if (!a) return;

				var videoUrl = a.getAttribute("href") || "";
				var videoId = li.getAttribute("data-video-id") || a.getAttribute("data-video-id") || "";
				var title = a.getAttribute("title") || a.getAttribute("data-title") || li.getAttribute("data-title") || "";
				if (!title) {
					var txt = a.textContent || "";
					if (txt && txt.trim()) title = txt.trim();
				}

				var thumbnailUrl = extractThumbnail(li);
				var durationVar = li.querySelector(".duration, var.duration");
				var durationStr = durationVar ? durationVar.textContent.trim() : "0:00";
				var duration = parseDuration(durationStr);

				var viewsSpan = li.querySelector(".views var, .views");
				var viewsStr = viewsSpan ? viewsSpan.textContent.trim() : "0";
				var views = parseNumberSuffix(viewsStr);

				if (!videoId && videoUrl) {
					var x = videoUrl.match(/viewkey=([^&]+)/i);
					videoId = x && x[1] ? x[1] : "";
				}

				if (!videoUrl) return;
				var authorNode = li.querySelector(".usernameWrap a, .pornstarName, .authorName");
				var authorName = authorNode ? authorNode.textContent.trim() : "";
				var authorUrl = authorNode ? (authorNode.getAttribute("href") || "") : "";

				results.push({
					id: videoId,
					videoUrl: videoUrl,
					title: title,
					thumbnailUrl: thumbnailUrl,
					duration: duration,
					views: views,
					authorInfo: {
						authorName: authorName,
						channel: authorUrl,
						avatar: ""
					}
				});
			});

			if (results.length > 0) return results;
		}
	}

	var embedded = [];
	embedded = embedded.concat(extractEmbeddedJsonArray(html, ["videoPlaylist", "playlistVideos", "playlistVideosData", "JSON_PLAYLIST"]));
	if (!embedded.length) {
		var fallback = extractEmbeddedJsonArray(html, ["videos", "items"]);
		if (fallback.length) embedded = fallback;
	}

	var normalized = [];
	embedded.forEach(function(entry) {
		if (!entry) return;
		var parsedEntry = parsePlaylistVideo(entry);
		if (parsedEntry) normalized.push(parsedEntry);

		if (entry && Array.isArray(entry.videos)) {
			entry.videos.forEach(function(sub) {
				var item = parsePlaylistVideo(sub);
				if (item) normalized.push(item);
			});
		}
		if (entry && Array.isArray(entry.items)) {
			entry.items.forEach(function(sub) {
				var item = parsePlaylistVideo(sub);
				if (item) normalized.push(item);
			});
		}
	});

	return normalized;
}

function parsePlaylistPage(html, playlistUrl, playlistId) {
	var dom = domParser.parseFromString(html, "text/html");

	var title = "";
	var titleNode = dom.querySelector("h1#watchPlaylist, h1.playlistTitle, .playlistTitle, h1[itemprop=name], .title h1, h1");
	if (titleNode) title = titleNode.textContent.trim();

	var authorName = "";
	var authorUrl = "";
	var authorNode = dom.querySelector("#js-aboutPlaylistTabView .usernameWrap a, #playlistWrapper .usernameWrap a, .playlistAuthor a, .usernameWrap a, .userInfo a");
	if (authorNode) {
		authorName = authorNode.textContent.trim();
		authorUrl = absolutePlatformUrl(authorNode.getAttribute("href") || "");
	}

	var videos = [];
	var parsed = extractPlaylistVideosFromHtml(html);
	if (parsed.length > 0) {
		var seen = {};
		parsed.forEach(function(video) {
			if (!video || !video.videoUrl) return;
			var key = String(video.id || video.videoUrl);
			if (!key || seen[key]) return;
			seen[key] = true;
			videos.push({
				id: video.id || key,
				videoUrl: video.videoUrl,
				title: video.title || "",
				thumbnailUrl: video.thumbnailUrl || "",
				duration: Number(video.duration) || 0,
				views: Number(video.views) || 0,
				authorInfo: {
					authorName: authorName || (video.authorInfo && video.authorInfo.authorName) || "",
					channel: authorUrl || (video.authorInfo && video.authorInfo.channel) || "",
					avatar: (video.authorInfo && video.authorInfo.avatar) || ""
				}
			});
		});
	}

	if (!title) {
		var generic = dom.querySelector("title");
		if (generic) title = generic.textContent.replace(/PornHub/i, "").trim();
	}
	if (!title) title = "Playlist";

	var thumbnail = "";
	if (videos.length > 0 && videos[0].thumbnailUrl) thumbnail = videos[0].thumbnailUrl;
	else {
		var thumbNode = dom.querySelector("img#coverPictureDefault, img.cover, img.playlist-thumb, img");
		if (thumbNode) thumbnail = absolutePlatformUrl(thumbNode.getAttribute("src") || thumbNode.getAttribute("data-src") || "");
	}

	var playlistItems = videos.map(function(v) {
		return new PlatformVideo({
			id: new PlatformID(PLATFORM, String(v.id || v.videoUrl || ""), config.id),
			name: v.title || "",
			thumbnails: new Thumbnails([new Thumbnail(v.thumbnailUrl || thumbnail, 0)]),
			author: new PlatformAuthorLink(
				new PlatformID(PLATFORM, authorName || authorUrl || "PornHub", config.id),
				authorName || "PornHub",
				authorUrl || URL_BASE,
				""
			),
			datetime: undefined,
			duration: v.duration || 0,
			viewCount: v.views || 0,
			url: absolutePlatformUrl(v.videoUrl || ""),
			isLive: false
		});
	});

	return new PlatformPlaylistDetails({
		id: new PlatformID(PLATFORM, "playlist:" + playlistId, config.id),
		name: title,
		thumbnails: new Thumbnails(thumbnail ? [new Thumbnail(thumbnail, 0)] : []),
		thumbnail: thumbnail,
		author: new PlatformAuthorLink(
			new PlatformID(PLATFORM, authorName || authorUrl || "PornHub", config.id),
			authorName || "PornHub",
			authorUrl || URL_BASE,
			""
		),
		datetime: 0,
		url: playlistUrl,
		videoCount: playlistItems.length,
		contents: new VideoPager(playlistItems, false)
	});
}

source.isPlaylistUrl = function(url) {
	return playlistIdFromUrl(url) !== "";
};

source.getPlaylist = function(url) {
	var playlistId = playlistIdFromUrl(url);
	if (!playlistId) throw new ScriptException("Invalid playlist URL.");
	var playlistUrl = URL_BASE + "/playlist/" + playlistId;
	var html = httpGET(playlistUrl, {});
	return parsePlaylistPage(html, playlistUrl, playlistId);
};

source.isContentDetailsUrl = function(url) {
	return url.includes(".pornhub.com/view_video.php?viewkey=") || url.includes("/view_video.php?viewkey=");
};

const supportedResolutions = {
	'1080': { width: 1920, height: 1080 },
	'720': { width: 1280, height: 720 },
	'480': { width: 854, height: 480 },
	'360': { width: 640, height: 360 },
	'240': { width: 352, height: 240 },
	'144': { width: 256, height: 144 }
};

function playbackHeaders(url) {
	return {
		"Referer": url,
		"User-Agent": headers["User-Agent"],
		"Origin": URL_BASE,
		"Cookie": headers["Cookie"]
	};
}

function normalizeMediaDefinition(definition) {
	if (!definition || typeof definition !== "object") return null;
	if (typeof definition.quality === "object") return null;
	if (!supportedResolutions[definition.quality]) return null;
	if (typeof definition.videoUrl !== "string") return null;
	if (!/^https?:\/\//i.test(definition.videoUrl)) return null;
	return definition;
}

function extractFlashvarsFromHtml(html) {
	if (!html || typeof html !== "string") return null;

	const patterns = [
		/(?:var|let|const)\s+flashvars(?:_\d+)?\s*[:=]\s*({[\s\S]*?});/i,
		/(?:window|var)\s*__INITIAL_STATE__\s*[:=]\s*({[\s\S]*?});?/i,
		/(?:window|var)\s*INITIAL_STATE\s*[:=]\s*({[\s\S]*?});?/i,
		/"mediaDefinitions"\s*:\s*(\[[\s\S]*?\])\s*(?:,|\})/i
	];

	for (let i = 0; i < patterns.length; i++) {
		const match = html.match(patterns[i]);
		if (!match || !match[1]) continue;
		try {
			const parsed = JSON.parse(match[1]);
			if (parsed && Array.isArray(parsed.mediaDefinitions)) return parsed;
			if (parsed && parsed.mediaDefinitions && Array.isArray(parsed.mediaDefinitions)) return parsed;
			if (parsed && parsed.video && Array.isArray(parsed.video.mediaDefinitions)) return parsed.video;
			if (parsed && parsed.data && Array.isArray(parsed.data.mediaDefinitions)) return parsed.data;
			if (parsed && parsed.videos && Array.isArray(parsed.videos)) {
				const nested = parsed.videos.find(item => item && Array.isArray(item.mediaDefinitions));
				if (nested) return nested;
			}
		} catch (e) {}
	}

	try {
		const startIndex = html.indexOf('"mediaDefinitions"');
		if (startIndex !== -1) {
			const arrayStart = html.indexOf('[', startIndex);
			if (arrayStart !== -1) {
				let bracketCount = 0;
				let arrayEnd = -1;
				let inString = false;
				let escapeNext = false;

				for (let i = arrayStart; i < html.length; i++) {
					const char = html[i];
					if (escapeNext) { escapeNext = false; continue; }
					if (char === '\\') { escapeNext = true; continue; }
					if (char === '"' && !escapeNext) { inString = !inString; continue; }
					if (inString) continue;

					if (char === '[') bracketCount++;
					else if (char === ']') {
						bracketCount--;
						if (bracketCount === 0) {
							arrayEnd = i + 1;
							break;
						}
					}
				}

				if (arrayEnd !== -1) {
					const arrayStr = html.substring(arrayStart, arrayEnd);
					const parsedArray = JSON.parse(arrayStr);
					if (Array.isArray(parsedArray)) return { mediaDefinitions: parsedArray };
				}
			}
		}
	} catch (e) {}

	return null;
}

function loadPlaybackPage(url) {
	let lastCode = null;
	for (let attempt = 0; attempt < 3; attempt++) {
		const pageUrl = attempt === 0 ? url : url + (url.includes("?") ? "&" : "?") + "_=" + Date.now() + attempt;
		const html = httpGET(pageUrl, {});
		const flashvars = extractFlashvarsFromHtml(html);
		if (!flashvars || !Array.isArray(flashvars.mediaDefinitions)) {
			throw new ScriptException("El reproductor de video no está disponible en esta página.");
		}

		const definitions = flashvars.mediaDefinitions
			.filter(definition => definition && typeof definition === "object")
			.map(definition => {
				if (typeof definition.quality === "string") definition.quality = definition.quality.toString();
				if (typeof definition.videoUrl === "string" && !/^https?:\/\//i.test(definition.videoUrl)) {
					definition.videoUrl = absolutePlatformUrl(definition.videoUrl);
				}
				return definition;
			})
			.filter(definition => {
				if (!definition || typeof definition !== "object") return false;
				const format = String(definition.format || "").toLowerCase();
				const quality = String(definition.quality || "");
				const hasSupportedQuality = !!supportedResolutions[quality];
				const hasUrl = typeof definition.videoUrl === "string" && definition.videoUrl.length > 0;
				const isHlsMp4 = format === "hls" || format === "mp4";
				return isHlsMp4 && hasSupportedQuality && hasUrl;
			});

		if (!definitions.length) throw new ScriptException("El video no tiene enlaces de reproducción compatibles.");

		const probe = definitions.find(definition => definition.defaultQuality === true || definition.defaultQuality === "true") || definitions[0];
		const response = http.GET(probe.videoUrl, playbackHeaders(url));

		if (response.isOk && /^\s*#EXTM3U/.test(response.body || "")) {
			return { html, flashvars, definitions };
		}

		lastCode = response.code;
		if (![403, 404, 410].includes(lastCode)) break;
	}
	throw new ScriptException("The streaming server could not provide a valid playlist (HTTP " + lastCode + "). Please try again.");
}

source.getContentDetails = function(url) {
	const page = loadPlaybackPage(url);
	var html = page.html;
	const flashvars = page.flashvars;
	var mediaDefinitions = page.definitions;
	var sources = [];

	let has1080 = mediaDefinitions.some(d => d.quality === "1080");
	let has720 = mediaDefinitions.some(d => d.quality === "720");
	let forcedDefault = has1080 ? "1080" : (has720 ? "720" : null);

	for (const def of mediaDefinitions) {
		var resolution = supportedResolutions[def.quality];
		if (!resolution) continue;

		let isDefault = forcedDefault ? (def.quality === forcedDefault) : (def.defaultQuality === true || def.defaultQuality === "true");

		if (def.format === "hls") {
			sources.push(new HLSSource({
				name: `${resolution.width}x${resolution.height} (Auto)`,
				url: def.videoUrl,
				duration: flashvars.video_duration ?? 0,
				priority: isDefault,
				requestModifier: { headers: playbackHeaders(url) }
			}));
		} else if (def.format === "mp4") {
			sources.push(new VideoSource({
				name: def.quality + "p",
				url: def.videoUrl,
				width: resolution.width,
				height: resolution.height,
				duration: flashvars.video_duration ?? 0,
				container: "mp4",
				priority: isDefault,
				requestModifier: { headers: playbackHeaders(url) }
			}));
		}
	}

	var subtitles = [];
	if (flashvars.closedCaptionsFile) {
		subtitles.push(new SubtitleSource({
			url: flashvars.closedCaptionsFile,
			name: "Subtítulos",
			format: flashvars.closedCaptionsFile.includes(".vtt") ? "vtt" : "srt"
		}));
	}

	var dom = domParser.parseFromString(html);
	var ldJson = {};
	try {
		var scriptNode = dom.querySelector('script[type="application/ld+json"]');
		if (scriptNode && scriptNode.text) ldJson = JSON.parse(scriptNode.text);
	} catch (e) {}

	var description = ldJson.description || "";
	var userAvatar = "";
	var userInfoNode = null;
	var userAvatarNode = dom.getElementsByClassName("userAvatar")[0];
	if (userAvatarNode) {
		var avatarImg = userAvatarNode.querySelector("img");
		if (avatarImg) userAvatar = avatarImg.getAttribute("src") || "";
	}
	userInfoNode = dom.getElementsByClassName("userInfo")[0] || null;
	var channelUrlId = "";
	if (userInfoNode) {
		var usernameLink = userInfoNode.querySelector("div.usernameWrap a");
		if (usernameLink && usernameLink.getAttribute("href")) {
			channelUrlId = usernameLink.getAttribute("href").split('/').pop();
		}
	}

	var subscribersStr = "0";
	if (userInfoNode) {
		var infoSpans = userInfoNode.querySelectorAll("span");
		for (var i = 0; i < infoSpans.length; i++) {
			var spanText = infoSpans[i].textContent.trim();
			if (spanText.includes("Subscriber")) {
				subscribersStr = spanText;
				break;
			}
		}
	}
	var subscribers = parseStringWithKorMSuffixes(subscribersStr);
	var displayName = userInfoNode && userInfoNode.querySelector("a") ? userInfoNode.querySelector("a").text : "Unknown";
	var channelUrl = (userInfoNode && userInfoNode.querySelector("a") && userInfoNode.querySelector("a").getAttribute("href")) ? URL_BASE + userInfoNode.querySelector("a").getAttribute("href") : URL_BASE;
	var views = interactionCountFromLdJson(ldJson);
	var videoId = (flashvars.playbackTracking && flashvars.playbackTracking.video_id) ? flashvars.playbackTracking.video_id.toString() : (flashvars.video_id || "0");

	var likes = 0;
	var dislikes = 0;
	var votesUpNode = dom.querySelector("span.votesUp");
	var votesDownNode = dom.querySelector("span.votesDown");
	if (votesUpNode) likes = parseNumberSuffix(votesUpNode.textContent.trim());
	if (votesDownNode) dislikes = parseNumberSuffix(votesDownNode.textContent.trim());

	const details = new PlatformVideoDetails({
		id: new PlatformID(PLATFORM, videoId, config.id),
		name: flashvars.video_title || "Porn video",
		thumbnails: new Thumbnails([new Thumbnail(flashvars.image_url || "", 0)]),
		author: new PlatformAuthorLink(new PlatformID(PLATFORM, channelUrlId || displayName, config.id), displayName, channelUrl, userAvatar ?? "", subscribers ?? 0),
		datetime: Math.round((new Date(ldJson.uploadDate || Date.now())).getTime() / 1000),
		duration: flashvars.video_duration || 0,
		viewCount: views,
		url: flashvars.link_url || url,
		isLive: false,
		description: description,
		video: new VideoSourceDescriptor(sources),
		subtitles: subtitles,
		rating: new RatingLikesDislikes(likes, dislikes)
	});

	details.getContentRecommendations = function() {
		return source.getContentRecommendations(url);
	};
	return details;
};

source.getContentRecommendations = function(url) {
	var html = httpGET(url, {});
	var dom = domParser.parseFromString(html);
	var liElements = dom.querySelectorAll("li.pcVideoListItem");
	if (liElements.length === 0) return new ContentPager([], false);

	var resultArray = [];
	liElements.forEach(function(li) {
		const videoId = li.getAttribute("data-video-id");
		if (videoId && !isNaN(videoId)) {
			const aElement = li.querySelector('a.thumbnailTitle, a[href*="view_video"]');
			if (aElement) {
				const videoUrl = aElement.getAttribute('href');
				if (videoUrl) {
					const thumbnailUrl = extractThumbnail(li);
					const imgElement = li.querySelector('img');
					const title = aElement.getAttribute("title") || aElement.textContent.trim() || (imgElement ? imgElement.getAttribute("alt") : "");
					const durationVar = li.querySelector(".duration, var.duration");
					const durationStr = durationVar ? durationVar.textContent.trim() : "0:00";
					const duration = parseDuration(durationStr);
					const viewsSpan = li.querySelector(".views var, .views");
					const viewsStr = viewsSpan ? viewsSpan.textContent.trim() : "0";
					const views = viewsStr && (viewsStr.includes("K") || viewsStr.includes("M")) ? parseNumberSuffix(viewsStr) : 0;
					const authorLink = li.querySelector(".usernameWrap a, a[href*='/model/'], a[href*='/pornstar/'], a[href*='/channels/']");
					let authorInfo = { channel: "", authorName: "" };
					if (authorLink) {
						authorInfo.channel = URL_BASE + authorLink.getAttribute("href");
						authorInfo.authorName = authorLink.textContent.trim();
					}
					resultArray.push(new PlatformVideo({
						id: new PlatformID(PLATFORM, videoId, config.id),
						name: title ?? "",
						thumbnails: new Thumbnails([new Thumbnail(thumbnailUrl, 0)]),
						author: new PlatformAuthorLink(new PlatformID(PLATFORM, authorInfo.authorName, config.id), authorInfo.authorName, authorInfo.channel, ""),
						datetime: undefined,
						duration: duration,
						viewCount: views,
						url: videoUrl.startsWith("http") ? videoUrl : URL_BASE + videoUrl,
						isLive: false
					}));
				}
			}
		}
	});
	return new ContentPager(resultArray, false);
};

source.getShorts = function(context) {
	var from = 1;
	var count = 12;
	if (typeof context === 'string') {
		try {
			const parsed = JSON.parse(context);
			from = parsed.from ?? 1;
			count = parsed.count ?? 12;
		} catch (e) {}
	} else if (context) {
		from = context.from ?? 1;
		count = context.count ?? 12;
	}
	return getShortsPager(from, count);
};

function extractShortsArrayFromHtml(html) {
	if (!html || typeof html !== "string") return [];

	var candidates = [
		/JSON_SHORTIES\s*=\s*insertAfterNthPosition\(\s*(\[[\s\S]*?\])\s*\)/i,
		/JSON_SHORTIES\s*=\s*(\[[\s\S]*?\])\s*;/i,
		/(?:var|let|const)\s+shortsData\s*=\s*(\[[\s\S]*?\])\s*;/i,
		/(?:var|let|const)\s+JSON_SHORTIES\s*=\s*(\[[\s\S]*?\])\s*;/i
	];

	for (var i = 0; i < candidates.length; i++) {
		var match = html.match(candidates[i]);
		if (match && match[1]) {
			try {
				var arr = JSON.parse(match[1]);
				if (Array.isArray(arr)) return arr;
			} catch (e) {}
		}
	}

	var statePatterns = [
		/(?:window|var)\s*__INITIAL_STATE__\s*[:=]\s*({[\s\S]*?})\s*;?/i,
		/(?:window|var)\s*INITIAL_STATE\s*[:=]\s*({[\s\S]*?})\s*;?/i
	];

	for (var j = 0; j < statePatterns.length; j++) {
		var stateMatch = html.match(statePatterns[j]);
		if (!stateMatch || !stateMatch[1]) continue;
		try {
			var stateObj = JSON.parse(stateMatch[1]);
			if (!stateObj) continue;
			var container = Array.isArray(stateObj) ? stateObj :
				(stateObj.shorts || stateObj.shorties || stateObj.items || stateObj.data || stateObj.videos || stateObj.result || []);
			if (Array.isArray(container)) return container;
		} catch (e) {}
	}

	return [];
}

function getShortsPager(from, count) {
	var safeFrom = Math.max(1, Number(from) || 1);
	var safeCount = Math.max(1, Number(count) || 12);

	var url = URL_BASE + "/shorties";
	var html = httpGET(url, {});
	var shortsData = extractShortsArrayFromHtml(html);

	if (!shortsData || shortsData.length === 0) {
		return new PornhubVideoPager([], false, "/shorties", { from: safeFrom, count: safeCount }, safeFrom);
	}

	var resultArray = [];
	shortsData.forEach(function(short) {
		if (!short) return;

		var shortId = short.videoId || short.id || short.video_id || "";
		if (!shortId) return;

		var videoId = String(shortId);
		var title = short.videoTitle || short.title || short.name || "";
		var thumbnailUrl = short.imageUrl || short.thumbnailUrl || short.image || "";
		var videoUrl = short.linkUrl || short.videoUrl || short.url || "";
		var authorName = short.name || short.authorName || "";
		var authorUrl = short.profileUrl || short.authorUrl || "";
		var duration = Number(short.trackingTimeWatched && short.trackingTimeWatched.video_duration) || 0;
		if (!duration && short.duration) duration = Number(short.duration) || 0;

		var views = 0;
		if (short.likeInfo) {
			var likeStr = String(short.likeInfo);
			if (likeStr.includes("K") || likeStr.includes("M")) views = parseNumberSuffix(likeStr);
			else views = parseInt(likeStr, 10) || 0;
		} else if (short.views) {
			views = parseNumberSuffix(String(short.views));
		}

		var sources = [];
		if (short.mediaDefinitions && Array.isArray(short.mediaDefinitions)) {
			short.mediaDefinitions.forEach(function(mediaDefinition) {
				if (!mediaDefinition || mediaDefinition.format !== "hls" || !mediaDefinition.videoUrl) return;
				var quality = mediaDefinition.quality;
				var resolution = supportedResolutions[quality];
				if (!resolution) return;

				sources.push(new HLSSource({
					name: quality + "p",
					url: mediaDefinition.videoUrl,
					duration: duration,
					priority: mediaDefinition.defaultQuality === true,
					requestModifier: { headers: { "Referer": URL_BASE + "/" } }
				}));
			});
		}

		if (sources.length > 0) {
			resultArray.push(new PlatformVideoDetails({
				id: new PlatformID(PLATFORM, videoId, config.id),
				name: title || "",
				thumbnails: new Thumbnails([new Thumbnail(thumbnailUrl, 0)]),
				author: new PlatformAuthorLink(new PlatformID(PLATFORM, authorName || authorUrl || videoId, config.id), authorName || "PornHub", authorUrl || URL_BASE, ""),
				datetime: undefined,
				duration: duration,
				viewCount: views,
				url: videoUrl.startsWith("http") ? videoUrl : URL_BASE + videoUrl,
				isLive: false,
				isShort: true,
				description: "",
				video: new VideoSourceDescriptor(sources),
				rating: new RatingLikes(parseInt(short.likeNumber, 10) || 0)
			}));
		} else {
			resultArray.push(new PlatformVideo({
				id: new PlatformID(PLATFORM, videoId, config.id),
				name: title || "",
				thumbnails: new Thumbnails([new Thumbnail(thumbnailUrl, 0)]),
				author: new PlatformAuthorLink(new PlatformID(PLATFORM, authorName || authorUrl || videoId, config.id), authorName || "PornHub", authorUrl || URL_BASE, ""),
				datetime: undefined,
				duration: duration,
				viewCount: views,
				url: videoUrl.startsWith("http") ? videoUrl : URL_BASE + videoUrl,
				isLive: false,
				isShort: true
			}));
		}
	});

	var hasMore = shortsData.length >= safeCount;
	return new PornhubVideoPager(resultArray, !!hasMore, "/shorties", { from: safeFrom, count: safeCount }, safeFrom);
}

function isBotChallenge(html) {
	return html.includes("function leastFactor(n)") && html.includes("document.cookie=\"KEY=");
}

function solveBotChallenge(html) {
	try {
		var scriptStart = html.indexOf("<script type=\"text/javascript\">");
		var scriptEnd = html.indexOf("</script>", scriptStart);
		if (scriptStart === -1 || scriptEnd === -1) return null;
		var scriptContent = html.substring(scriptStart + 31, scriptEnd);
		scriptContent = scriptContent.replace(/<!--/g, "").replace(/-->/g, "");
		scriptContent = scriptContent.replace(/document\.cookie\s*=\s*"KEY="\s*\+\s*([^;]+);/, 'return $1;');
		scriptContent = scriptContent.replace(/document\.location\.reload\([^)]*\);?/g, "");
		scriptContent = scriptContent.replace(/window\.location\.reload\([^)]*\);?/g, "");
		var solverCode = scriptContent + "\ntry { return go(); } catch(e) { return null; }";
		var keyCookieValue = eval("(function() { " + solverCode + " })()");
		if (keyCookieValue) return keyCookieValue;
		else return null;
	} catch (e) {
		return null;
	}
}

function refreshSession() {
	const resp = http.GET(URL_BASE, headers);
	if (!resp.isOk) throw new ScriptException("Failed request [" + URL_BASE + "] (" + resp.code + ")");
	else {
		var dom = domParser.parseFromString(resp.body);
		const searchInput = dom.querySelector("#searchInput");
		if (searchInput) state.token = searchInput.getAttribute("data-token");

		var sessionId = "";
		const metaTag = dom.querySelector("meta[name=\"adsbytrafficjunkycontext\"]");
		if (metaTag) {
			const adContextInfo = metaTag.getAttribute("data-info");
			try {
				sessionId = JSON.parse(adContextInfo)["session_id"];
				state.sessionCookie = sessionId;
			} catch (e) {}
		}
		var cookiesFromHeaders = [];
		if (resp.headers && resp.headers["set-cookie"]) {
			var setCookieHeaders = resp.headers["set-cookie"];
			if (typeof setCookieHeaders === 'string') setCookieHeaders = [setCookieHeaders];
			for (var i = 0; i < setCookieHeaders.length; i++) {
				var cookieParts = setCookieHeaders[i].split(';')[0].trim();
				if (cookieParts) cookiesFromHeaders.push(cookieParts);
			}
		}
		var cookieString = "platform=pc; accessAgeDisclaimerPH=2";
		for (var i = 0; i < cookiesFromHeaders.length; i++) cookieString += "; " + cookiesFromHeaders[i];
		if (sessionId) cookieString += "; ss=" + sessionId;
		headers["Cookie"] = cookieString;
	}
}

function httpGET(url, options = {}) {
	var customHeaders = options.headers || null;
	var requireToken = options.requireToken || false;
	var parseJson = options.parseJson || false;
	var retries = options.retries !== undefined ? options.retries : 3;
	let lastError = null;
	let attempts = retries + 1;
	var requestHeaders = customHeaders || headers;

	while (attempts > 0) {
		try {
			if (headers["Cookie"].length === 0) {
				refreshSession();
				if (!customHeaders) requestHeaders = headers;
				else { customHeaders["Cookie"] = headers["Cookie"]; requestHeaders = customHeaders; }
			} else if (requireToken && state.token === "") {
				refreshSession();
				if (!customHeaders) requestHeaders = headers;
				else { customHeaders["Cookie"] = headers["Cookie"]; requestHeaders = customHeaders; }
			}

			const resp = http.GET(url, requestHeaders);
			if (resp.code === 404 && options.emptyOnNotFound === true) return null;
			if (!resp.isOk) throw new ScriptException("Request [" + url + "] failed with code [" + resp.code + "]");

			var body = resp.body;

			if (isBotChallenge(body)) {
				var keyCookieValue = solveBotChallenge(body);
				if (!keyCookieValue) throw new ScriptException("Failed to solve bot challenge");

				headers["Cookie"] += "; KEY=" + keyCookieValue;
				if (!customHeaders) requestHeaders = headers;
				else { customHeaders["Cookie"] = headers["Cookie"]; requestHeaders = customHeaders; }

				const retryResp = http.GET(url, requestHeaders);
				if (!retryResp.isOk) throw new ScriptException("Retry request [" + url + "] failed with code [" + retryResp.code + "]");
				body = retryResp.body;
				if (isBotChallenge(body)) throw new ScriptException("Bot challenge persists after solving");
			}

			if (parseJson) {
				try {
					var json = JSON.parse(body);
					if (json.error) throw new ScriptException("API error: " + json.error);
					return json;
				} catch (parseError) {
					throw new ScriptException("JSON parse error: " + parseError);
				}
			}
			return body;
		} catch (error) {
			lastError = error;
			attempts--;
			if (attempts > 0) {
				if (error.toString().includes("401") || error.toString().includes("403") || error.toString().includes("session") || error.toString().includes("token") || error.toString().includes("410")) {
					try {
						refreshSession();
						if (!customHeaders) requestHeaders = headers;
						else { customHeaders["Cookie"] = headers["Cookie"]; requestHeaders = customHeaders; }
					} catch (e) {}
				}
				bridge.sleep(1000);
				continue;
			}
			throw lastError;
		}
	}
	throw lastError || new ScriptException("Request failed for unknown reason");
}

source.getComments = function(url) {
	var videoId = "";
	try {
		const match = url.match(/viewkey=([^&]+)/);
		if (match && match[1]) videoId = match[1];
	} catch (e) {}

	if (!videoId) {
		try {
			var html = httpGET(url, {});
			var dom = domParser.parseFromString(html);
			var player = dom.querySelector("div#player") || dom.querySelector("[data-video-id]");
			if (player) videoId = player.getAttribute("data-video-id");
		} catch (e) {
			log("Error obteniendo videoId para comentarios: " + e);
		}
	}

	if (!videoId) return new CommentPager([], false);
	if (!state.token) {
		try { refreshSession(); } catch (e) {}
	}
	return getCommentPager(`/comment/show?id=${videoId}&popular=0&what=video&token=${state.token}`, {}, 1);
};

source.getSubComments = function(comment) {
	if (!comment.context || !comment.context.id) return new CommentPager([], false);
	const url = URL_BASE + `/comment/replies?id=${comment.context.id}&token=${state.token}`;
	try {
		var html = httpGET(url, { requireToken: true });
		var comments = getComments(html);
		return new CommentPager(comments.comments.map(c => {
			return new Comment({
				author: new PlatformAuthorLink(new PlatformID(PLATFORM, c.username, config.id), c.username, "", c.avatar, ""),
				message: c.message,
				rating: new RatingLikesDislikes(c.voteUp, c.voteDown),
				date: Math.round(c.date.getTime() / 1000),
				replyCount: 0,
				context: { id: c.id }
			});
		}), false);
	} catch (e) {
		return new CommentPager([], false);
	}
};

function getCommentPager(path, params, page) {
	const count = 10;
	const page_end = (page ?? 1) * count;
	params = { ...params, page };
	const url = URL_BASE + path;
	const query = buildQuery(params);
	const urlWithParams = query ? `${url}${url.includes("?") ? "&" + query.substring(1) : query}` : url;
	var html = httpGET(urlWithParams, { requireToken: true });
	var comments = getComments(html);
	if (comments.total === 0) return new PornhubCommentPager([], false, path, params, page);

	return new PornhubCommentPager(comments.comments.map(c => {
		return new Comment({
			author: new PlatformAuthorLink(new PlatformID(PLATFORM, c.username, config.id), c.username, "", c.avatar, ""),
			message: c.message,
			rating: new RatingLikesDislikes(c.voteUp, c.voteDown),
			date: Math.round(c.date.getTime() / 1000),
			replyCount: c.totalReplies || 0,
			context: { id: c.id }
		});
	}), !!(comments.total > page_end), path, params, page);
}

function getComments(html) {
	var dom = domParser.parseFromString(html);
	var comments = [];
	const commentBlocks = dom.querySelectorAll('div#cmtContent div.commentBlock');
	const totalNode = dom.querySelector("div#cmtWrapper div.cmtHeader h2 span");
	const parsedTotal = totalNode ? parseInt(totalNode.textContent.replace(/[^0-9]/g, "")) : NaN;
	const total = Number.isFinite(parsedTotal) ? parsedTotal : commentBlocks.length;
	if (total > 0) {
		commentBlocks.forEach(commentBlock => {
			const className = commentBlock.getAttribute("class") || "";
			const idMatch = className.match(/commentTag([A-Za-z0-9_-]+)/);
			if (!idMatch) return;
			const avatar = imageUrl(commentBlock.querySelector("img"));
			const usernameNode = commentBlock.querySelector('.usernameLink');
			const dateNode = commentBlock.querySelector('div.date');
			const messageNode = commentBlock.querySelector('.commentMessage span');
			if (!messageNode) return;
			const voteNodes = commentBlock.querySelectorAll('span.voteTotal');
			const voteUp = voteNodes.length > 0 ? parseInt(voteNodes[0].textContent.trim()) || 0 : 0;
			const voteDown = voteNodes.length > 1 ? parseInt(voteNodes[1].textContent.trim()) || 0 : 0;
			comments.push({
				id: idMatch[1],
				avatar,
				username: usernameNode ? usernameNode.textContent.trim() : "Unknown",
				date: parseRelativeDate(dateNode ? dateNode.textContent.trim() : ""),
				message: messageNode.textContent.trim(),
				voteUp,
				voteDown,
				totalReplies: 0
			});
		});
		return { total: total, comments: comments };
	} else {
		return { total: 0, comments: [] };
	}
}

function normalizePornhubUrl(url) {
	if (!url) return url;
	return url.replace(/https?:\/\/([a-z]{2}\.)?pornhub\.com/, "https://www.pornhub.com");
}

function extractPlatformName(url, label) {
	try {
		if (label && label !== "") return label;
		var domain = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
		var platformMap = {
			'twitter.com': 'Twitter', 'x.com': 'Twitter', 'instagram.com': 'Instagram',
			'tiktok.com': 'TikTok', 'youtube.com': 'YouTube'
		};
		for (var pattern in platformMap) {
			if (domain.includes(pattern)) return platformMap[pattern];
		}
		var domainParts = domain.split('.');
		if (domainParts.length > 0) {
			var name = domainParts[0];
			return name.charAt(0).toUpperCase() + name.slice(1);
		}
		return "Website";
	} catch (e) {
		return "Website";
	}
}

function parseRelativeDate(relativeDate) {
	var now = new Date();
	var str = relativeDate.toLowerCase();
	var numMatch = str.match(/\d+/);
	var num = numMatch ? parseInt(numMatch[0]) : 1;

	if (str.includes('segundo') || str.includes('second')) return new Date(now - num * 1000);
	if (str.includes('minuto') || str.includes('minute')) return new Date(now - num * 60 * 1000);
	if (str.includes('hora') || str.includes('hour')) return new Date(now - num * 60 * 60 * 1000);
	if (str.includes('día') || str.includes('dia') || str.includes('day') || str.includes('ayer') || str.includes('yesterday')) return new Date(now - num * 24 * 60 * 60 * 1000);
	if (str.includes('semana') || str.includes('week')) return new Date(now - num * 7 * 24 * 60 * 60 * 1000);
	if (str.includes('mes') || str.includes('month')) { var d = new Date(now); d.setMonth(now.getMonth() - num); return d; }
	if (str.includes('año') || str.includes('year')) { var d = new Date(now); d.setFullYear(now.getFullYear() - num); return d; }

	return new Date(0);
}

function getChannelInfo(url) {
	var html = httpGET(url, {});
	let dom = domParser.parseFromString(html);
	const avatarElement = dom.getElementById("getAvatar");
	var channelThumbnail = avatarElement ? avatarElement.getAttribute("src") : "";
	const bannerElement = dom.getElementById("coverPictureDefault");
	var channelBanner = bannerElement ? bannerElement.getAttribute("src") : "";
	const nameElement = dom.querySelector("h1");
	var channelName = nameElement ? nameElement.textContent.trim() : "";

	var statsNode = dom.getElementById("stats");
	var channelSubscribers = 0;
	var channelViews = 0;
	var channelVideos = 0;
	if (statsNode) {
		var subsNode = statsNode.childNodes[1];
		if (subsNode && subsNode.textContent) channelSubscribers = parseInt(subsNode.textContent.trim().replace(/,/g, '')) || 0;
		var viewsNode = statsNode.childNodes[0];
		if (viewsNode && viewsNode.textContent) channelViews = parseInt(viewsNode.textContent.trim().replace(/,/g, '')) || 0;
		var vidsNode = statsNode.childNodes[2];
		if (vidsNode && vidsNode.textContent) channelVideos = parseInt(vidsNode.textContent.trim().split(" ")[0].replace(/,/g, '')) || 0;
	}

	const descElement = dom.querySelector(".cdescriptions");
	var channelDescription = (descElement && descElement.childNodes[0] && descElement.childNodes[0].textContent) ? descElement.childNodes[0].textContent.trim() : "";
	if (channelViews > 0 || channelVideos > 0 || channelSubscribers > 0) {
		channelDescription += "\n\n📊 Channel Stats:";
		if (channelVideos > 0) channelDescription += "\n• Total Videos: " + channelVideos.toLocaleString();
		if (channelViews > 0) channelDescription += "\n• Total Views: " + channelViews.toLocaleString();
		if (channelSubscribers > 0) channelDescription += "\n• Subscribers: " + channelSubscribers.toLocaleString();
	}
	var channelLinks = {};
	var socialLinksSection = dom.querySelector(".socialLinksSection, section.socialLinksSection");
	if (socialLinksSection) {
		var socialLinks = socialLinksSection.querySelectorAll("ul.socialList li a");
		socialLinks.forEach(function(link) {
			var href = link.getAttribute("href");
			if (href && !href.includes("pornhub.com")) {
				var linkText = link.querySelector(".socialText");
				var label = linkText ? linkText.textContent.trim() : "";
				var platformName = extractPlatformName(href, label);
				var linkLabel = label || platformName;
				if (linkLabel) channelLinks[linkLabel] = href;
			}
		});
	}
	return { channelName, channelThumbnail, channelBanner, channelSubscribers, channelDescription, channelUrl: normalizePornhubUrl(url), channelLinks };
}

function getPornstarInfo(url) {
	var html = httpGET(url, {});
	let dom = domParser.parseFromString(html);
	const avatarElement = dom.getElementById("getAvatar");
	const channelThumbnail = avatarElement ? avatarElement.getAttribute("src") : "";
	const bannerElement = dom.getElementById("coverPictureDefault");
	const channelBanner = bannerElement ? bannerElement.getAttribute("src") : "";
	const nameElement = dom.querySelector("div.name > h1, h1[itemprop=name], h1");
	const channelName = nameElement ? nameElement.textContent.trim() : "";

	var channelDescription = "";
	const aboutSection = dom.querySelector("section.aboutMeSection");
	if (aboutSection) {
		var divs = aboutSection.querySelectorAll("div");
		for (var i = 0; i < divs.length; i++) {
			if (!divs[i].getAttribute("class") && divs[i].textContent) {
				channelDescription = divs[i].textContent.trim();
				break;
			}
		}
	}

	var channelSubscribers = 0;
	var channelViews = 0;
	const statsNode = dom.querySelector("div.infoBoxes");
	if (statsNode) {
		const subsEl = statsNode.querySelector("div[data-title^=Subscribers] > span.big");
		if (subsEl && subsEl.textContent) channelSubscribers = parseNumberSuffix(subsEl.textContent.trim());
		const viewsEl = statsNode.querySelector("div[data-title^=Video] > span.big");
		if (viewsEl && viewsEl.textContent) channelViews = parseNumberSuffix(viewsEl.textContent.trim());
	}

	var channelVideos = 0;
	const videoCountElement = dom.querySelector("div.pornstarVideosCounter span.big, div.videosCounter span");
	if (videoCountElement && videoCountElement.textContent) {
		const videoCountText = videoCountElement.textContent.trim();
		channelVideos = videoCountText.includes("K") || videoCountText.includes("M") ? parseNumberSuffix(videoCountText) : parseInt(videoCountText.replace(/,/g, '')) || 0;
	}

	if (channelViews > 0 || channelVideos > 0 || channelSubscribers > 0) {
		channelDescription += "\n\n📊 Channel Stats:";
		if (channelVideos > 0) channelDescription += "\n• Total Videos: " + channelVideos.toLocaleString();
		if (channelViews > 0) channelDescription += "\n• Total Views: " + channelViews.toLocaleString();
		if (channelSubscribers > 0) channelDescription += "\n• Subscribers: " + channelSubscribers.toLocaleString();
	}
	var channelLinks = {};
	var socialLinksSection = dom.querySelector(".socialLinksSection, section.socialLinksSection");
	if (socialLinksSection) {
		var socialLinks = socialLinksSection.querySelectorAll("ul.socialList li a");
		socialLinks.forEach(function(link) {
			var href = link.getAttribute("href");
			if (href && !href.includes("pornhub.com")) {
				var linkText = link.querySelector(".socialText");
				var label = linkText ? linkText.textContent.trim() : "";
				var platformName = extractPlatformName(href, label);
				var linkLabel = label || platformName;
				if (linkLabel) channelLinks[linkLabel] = href;
			}
		});
	}
	return { channelName, channelThumbnail, channelBanner, channelSubscribers, channelDescription, channelUrl: normalizePornhubUrl(url), channelLinks };
}

class PornhubVideoPager extends VideoPager {
	constructor(results, hasMore, path, params, page) { super(results, !!hasMore, { path, params, page }); }
	nextPage() {
		if (this.context.path === "/shorties") {
			var params = this.context.params || {};
			var currentFrom = Number(params.from ?? this.context.page ?? 1) || 1;
			var count = Number(params.count ?? 12) || 12;
			return getShortsPager(currentFrom + count, count);
		}
		return getVideoPager(this.context.path, this.context.params, (this.context.page ?? 1) + 1);
	}
}

class PornhubChannelVideosPager extends VideoPager {
	constructor(results, hasMore, path, params, page) { super(results, !!hasMore, { path, params, page }); }
	nextPage() {
		if (this.context.path.includes("/channels/")) return getChannelVideosPager(this.context.path, this.context.params, (this.context.page ?? 1) + 1);
		else if (this.context.path.includes("/model/")) return getModelVideosPager(this.context.path, this.context.params, (this.context.page ?? 1) + 1);
		else return getPornstarVideosPager(this.context.path, this.context.params, (this.context.page ?? 1) + 1);
	}
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

function getAutocompleteChannelPager(query) {
	try {
		var apiUrl = URL_BASE + "/api/v1/video/search_autocomplete?pornstars=true&token=" + state.token + "&orientation=straight&q=" + encodeURIComponent(query) + "&alt=0";
		var json = httpGET(apiUrl, {
			headers: {
				"Cookie": headers["Cookie"],
				"User-Agent": headers["User-Agent"],
				"Accept": "*/*",
				"Accept-Language": "es-419,es;q=0.9,en-US;q=0.8,en;q=0.7",
				"Referer": URL_BASE + "/",
				"X-Requested-With": "XMLHttpRequest",
				"Content-Type": "application/x-www-form-urlencoded"
			},
			requireToken: true,
			parseJson: true,
			retries: 3
		});
		var allChannels = [];
		if (json.models && Array.isArray(json.models)) {
			json.models.forEach(model => allChannels.push(new PlatformAuthorLink(new PlatformID(PLATFORM, model.slug, config.id), model.name, URL_BASE + "/model/" + model.slug, "", 0)));
		}
		if (json.pornstars && Array.isArray(json.pornstars)) {
			json.pornstars.forEach(pornstar => allChannels.push(new PlatformAuthorLink(new PlatformID(PLATFORM, pornstar.slug, config.id), pornstar.name, URL_BASE + "/pornstar/" + pornstar.slug, "", 0)));
		}
		if (json.channels && Array.isArray(json.channels)) {
			json.channels.forEach(channel => allChannels.push(new PlatformAuthorLink(new PlatformID(PLATFORM, channel.slug, config.id), channel.name, URL_BASE + "/channels/" + channel.slug, "", 0)));
		}
		return new PornhubMultiChannelPager(allChannels, false, query, 1);
	} catch (e) {
		return new PornhubMultiChannelPager([], false, query, 1);
	}
}

function getMultiChannelPager(query, page) {
	var allChannels = [];
	var hasMore = false;
	try {
		var pornstarHtml = httpGET(URL_BASE + "/pornstars/search?search=" + encodeURIComponent(query) + "&page=" + page, {});
		var pornstars = getPornstarsFromSearch(pornstarHtml);
		allChannels = allChannels.concat(pornstars.channels);
		hasMore = hasMore || pornstars.hasNextPage;
	} catch (e) {}
	try {
		var channelHtml = httpGET(URL_BASE + "/channels/search?channelSearch=" + encodeURIComponent(query) + "&page=" + page, {});
		var channels = getChannels(channelHtml);
		allChannels = allChannels.concat(channels.channels);
		hasMore = hasMore || channels.hasNextPage;
	} catch (e) {}
	return new PornhubMultiChannelPager(allChannels.map(c => {
		return new PlatformAuthorLink(new PlatformID(PLATFORM, c.name, config.id), c.displayName, URL_BASE + c.url, c.avatar ?? "", c.subscribers);
	}), !!hasMore, query, page);
}

function getPornstarsFromSearch(html) {
	var dom = domParser.parseFromString(html);
	var resultArray = [];
	var pornstarElements = dom.querySelectorAll("div.pornstarsSearchResult li, ul.pornstars-list li, li.pornstar-item, div.performerCard");
	if (pornstarElements.length === 0) return { hasNextPage: false, channels: [] };

	pornstarElements.forEach(function(li) {
		var linkElement = li.querySelector("a");
		if (!linkElement) return;
		var url = linkElement.getAttribute("href");
		if (!url || !url.includes("/pornstar/")) return;
		var imgElement = li.querySelector("img");
		var avatar = imgElement ? (imgElement.getAttribute("data-src") || imgElement.getAttribute("src") || "") : "";
		var nameElement = li.querySelector(".pornStarName, .performerCardName, .title");
		var displayName = nameElement ? nameElement.textContent.trim() : "";
		if (!displayName && linkElement.getAttribute("title")) displayName = linkElement.getAttribute("title");
		var rankElement = li.querySelector(".rank_number, .subscribers, .subscribersText");
		var subscribers = 0;
		if (rankElement) {
			var subsText = rankElement.textContent.trim();
			subscribers = subsText.includes("K") || subsText.includes("M") ? parseNumberSuffix(subsText) : parseInt(subsText) || 0;
		}
		var name = url ? url.split("/").filter(s => s).pop() : displayName;
		if (url && displayName) {
			resultArray.push({ subscribers: subscribers, name: name, url: url, displayName: displayName, avatar: avatar });
		}
	});

	var hasNextPage = false;
	var pageNextNode = dom.querySelector("li.page_next a, a.page-next, .pagination a.next");
	if (pageNextNode && pageNextNode.getAttribute("href") && pageNextNode.getAttribute("href") !== "") hasNextPage = true;
	return { hasNextPage: hasNextPage, channels: resultArray };
}

function getChannelPager(path, params, page) {
	const count = 40;
	const page_end = (page ?? 1) * count;
	params = { ...params, page };
	const url = URL_BASE + path;
	const urlWithParams = `${url}${buildQuery(params)}`;
	var html = httpGET(urlWithParams, {});
	var channels = getChannels(html, "searchChannelsSection");
	return new PornhubChannelPager(channels.channels.map(c => {
		return new PlatformAuthorLink(new PlatformID(PLATFORM, c.name, config.id), c.displayName, URL_BASE + c.url, c.avatar ?? "", c.subscribers);
	}), !!channels.hasNextPage, path, params, page);
}

function getChannels(html) {
	var dom = domParser.parseFromString(html);
	var resultArray = [];
	var root = dom.getElementById("searchChannelsSection");
	if (!root) return { hasNextPage: false, channels: resultArray };

	root.childNodes.forEach((li) => {
		if (!li || !li.querySelector) return;
		var avatarNode = li.querySelector("div.avatar a.usernameLink img");
		var nameNode = li.querySelector("div.descriptionContainer li a.usernameLink");
		var subNode = li.querySelector("div.descriptionContainer li span");
		if (!avatarNode || !nameNode || !subNode) return;
		var avatar = avatarNode.getAttribute("src");
		var displayName = nameNode.textContent.trim();
		var url = nameNode.getAttribute("href") || "";
		var subscribers = parseInt(subNode.textContent.trim().replace(/,/, "")) || 0;
		var name = url.split("/")[1] || displayName;
		resultArray.push({ subscribers: subscribers, name: name, url: url, displayName: displayName, avatar: avatar });
	});
	var hasNextPage = false;
	var pageNextNode = dom.getElementsByClassName("page_next");
	if (pageNextNode.length > 0) {
		var nextAnchor = pageNextNode[0].querySelector("a");
		hasNextPage = nextAnchor && nextAnchor.getAttribute("href") !== "";
	}
	return { hasNextPage: hasNextPage, channels: resultArray };
}

function getChannelVideosPager(path, params, page) {
	const count = 36;
	params = { ...params, page };
	const urlWithParams = `${path}${buildQuery(params)}`;
	var html = httpGET(urlWithParams, {});
	var dom = domParser.parseFromString(html);
	var ulElement = dom.getElementById("mostRecentVideosSection") || dom.getElementById("moreData");
	if (!ulElement) {
		var ulElements = dom.querySelectorAll("ul.full-row-thumbs.videos, ul.videos.full-row-thumbs");
		for (var i = 0; i < ulElements.length; i++) {
			if (ulElements[i].querySelectorAll("li.pcVideoListItem").length > 0) {
				ulElement = ulElements[i];
				break;
			}
		}
	}
	if (!ulElement) {
		var vids = getChannelContents(html);
		return _buildPornhubChannelVideosPager(vids, !!(vids.totalElemsPages > (page ?? 1) * count), path, params, page);
	}
	var resultArray = [];
	var authorName = path.split("/")[4];
	var authorInfo = { authorName: authorName, avatar: "" };

	ulElement.querySelectorAll("li.pcVideoListItem").forEach(function(li) {
		const videoId = li.getAttribute("data-video-id");
		if (videoId && !isNaN(videoId)) {
			const aElement = li.querySelector('a.js-linkVideoThumb');
			if (aElement) {
				const videoUrl = aElement.getAttribute('href');
				if (videoUrl) {
					const thumbnailUrl = extractThumbnail(li);
					const imgElement = aElement.querySelector('img') || li.querySelector('img');
					const title = imgElement ? (imgElement.getAttribute("alt") || imgElement.getAttribute("data-title")) : aElement.getAttribute("data-title");
					const durationVar = aElement.querySelector(".duration");
					const durationStr = durationVar ? durationVar.textContent.trim() : "0:00";
					const duration = parseDuration(durationStr);
					const viewsSpan = li.querySelector(".views var");
					const viewsStr = viewsSpan ? viewsSpan.textContent.trim() : "0";
					const views = parseNumberSuffix(viewsStr);
					resultArray.push({ id: videoId, videoUrl: videoUrl, title: title, thumbnailUrl: thumbnailUrl, duration: duration, authorInfo: authorInfo, views: views });
				}
			}
		}
	});
	var vids = { videos: resultArray, totalElemsPages: resultArray.length };
	return _buildPornhubChannelVideosPager(vids, !!(resultArray.length >= count), path, params, page);
}

function getModelVideosPager(path, params, page) {
	params = { ...params, page };
	const urlWithParams = `${path}${buildQuery(params)}`;
	var html = httpGET(urlWithParams, {});
	var dom = domParser.parseFromString(html);
	var ulElement = dom.getElementById("mostRecentVideosSection") || dom.getElementById("moreData");
	if (!ulElement) {
		var ulElements = dom.querySelectorAll("ul.full-row-thumbs.videos, ul.videos.full-row-thumbs");
		for (var i = 0; i < ulElements.length; i++) {
			if (ulElements[i].querySelectorAll("li.pcVideoListItem").length > 0) {
				ulElement = ulElements[i];
				break;
			}
		}
	}
	if (ulElement) {
		var resultArray = [];
		var authorName = path.split("/")[4];
		var authorInfo = { authorName: authorName, avatar: "" };
		const count = 40;
		ulElement.querySelectorAll("li.pcVideoListItem").forEach(function(li) {
			const videoId = li.getAttribute("data-video-id");
			if (videoId && !isNaN(videoId)) {
				const aElement = li.querySelector('a.js-linkVideoThumb');
				if (aElement) {
					const videoUrl = aElement.getAttribute('href');
					if (videoUrl) {
						const thumbnailUrl = extractThumbnail(li);
						const imgElement = aElement.querySelector('img') || li.querySelector('img');
						const title = imgElement ? (imgElement.getAttribute("alt") || imgElement.getAttribute("data-title")) : aElement.getAttribute("data-title");
						const durationVar = aElement.querySelector(".duration");
						const durationStr = durationVar ? durationVar.textContent.trim() : "0:00";
						const duration = parseDuration(durationStr);
						const viewsSpan = li.querySelector(".views var");
						const viewsStr = viewsSpan ? viewsSpan.textContent.trim() : "0";
						const views = parseNumberSuffix(viewsStr);
						resultArray.push({ id: videoId, videoUrl: videoUrl, title: title, thumbnailUrl: thumbnailUrl, duration: duration, authorInfo: authorInfo, views: views });
					}
				}
			}
		});
		var vids = { videos: resultArray, hasNextPage: resultArray.length >= count };
		return _buildPornhubChannelVideosPager(vids, !!vids.hasNextPage, path, params, page);
	}
	var vidsOld = getModelContents(html);
	return _buildPornhubChannelVideosPager(vidsOld, !!vidsOld.hasNextPage, path, params, page);
}

function getPornstarVideosPager(path, params, page) {
	const count = 40;
	params = { ...params, page };
	const urlWithParams = `${path}${buildQuery(params)}`;
	var html = httpGET(urlWithParams, {});
	var dom = domParser.parseFromString(html);
	var ulElement = dom.getElementById("mostRecentVideosSection") || dom.getElementById("moreData");
	if (!ulElement) {
		var ulElements = dom.querySelectorAll("ul.full-row-thumbs.videos, ul.videos.full-row-thumbs");
		for (var i = 0; i < ulElements.length; i++) {
			if (ulElements[i].querySelectorAll("li.pcVideoListItem").length > 0) {
				ulElement = ulElements[i];
				break;
			}
		}
	}
	if (ulElement) {
		var resultArray = [];
		var authorName = path.split("/")[4];
		var authorInfo = { authorName: authorName, avatar: "" };
		ulElement.querySelectorAll("li.pcVideoListItem").forEach(function(li) {
			const videoId = li.getAttribute("data-video-id");
			if (videoId && !isNaN(videoId)) {
				const aElement = li.querySelector('a.js-linkVideoThumb');
				if (aElement) {
					const videoUrl = aElement.getAttribute('href');
					if (videoUrl) {
						const thumbnailUrl = extractThumbnail(li);
						const imgElement = aElement.querySelector('img') || li.querySelector('img');
						const title = imgElement ? (imgElement.getAttribute("alt") || imgElement.getAttribute("data-title")) : aElement.getAttribute("data-title");
						const durationVar = aElement.querySelector(".duration");
						const durationStr = durationVar ? durationVar.textContent.trim() : "0:00";
						const duration = parseDuration(durationStr);
						const viewsSpan = li.querySelector(".views var");
						const viewsStr = viewsSpan ? viewsSpan.textContent.trim() : "0";
						const views = parseNumberSuffix(viewsStr);
						resultArray.push({ id: videoId, videoUrl: videoUrl, title: title, thumbnailUrl: thumbnailUrl, duration: duration, authorInfo: authorInfo, views: views });
					}
				}
			}
		});
		var vids = { videos: resultArray, totalElemsPages: resultArray.length };
		return _buildPornhubChannelVideosPager(vids, !!(resultArray.length >= count), path, params, page);
	}
	var vidsOld = getPornstarContents(html);
	return _buildPornhubChannelVideosPager(vidsOld, !!(vidsOld.totalElemsPages > (page ?? 1) * count), path, params, page);
}

function _buildPornhubChannelVideosPager(vids, hasNextPage, path, params, page) {
	var channelUrl = path.replace(/\/videos.*$/, '');
	return new PornhubChannelVideosPager(vids.videos.map(v => {
		return new PlatformVideo({
			id: new PlatformID(PLATFORM, v.id, config.id),
			name: v.title ?? "",
			thumbnails: new Thumbnails([new Thumbnail(v.thumbnailUrl, 0)]),
			author: new PlatformAuthorLink(new PlatformID(PLATFORM, v.authorInfo.authorName, config.id), v.authorInfo.authorName, channelUrl, v.authorInfo.avatar),
			datetime: undefined,
			duration: v.duration,
			viewCount: v.views,
			url: URL_BASE + v.videoUrl,
			isLive: false
		});
	}), !!hasNextPage, path, params, page);
}

function getChannelContents(html) {
	var dom = domParser.parseFromString(html);
	var statsNodes = dom.querySelectorAll("div#stats div.info.floatRight");
	var total = (statsNodes && statsNodes[2]) ? parseInt(statsNodes[2].textContent.split(" VIDEOS")[0]) : 0;
	var resultArray = [];
	const nameElement = dom.querySelector("div.title h1");
	const avatarElement = dom.querySelector("img#getAvatar");
	var authorInfo = { authorName: nameElement ? nameElement.textContent.trim() : "", avatar: avatarElement ? avatarElement.getAttribute("href") : "" };
	const videosContainer = dom.getElementById("showAllChanelVideos");
	if (!videosContainer) return { totalElemsPages: total, videos: resultArray };

	videosContainer.childNodes.forEach((li) => {
		if (!li) return;
		const titleElement = li.querySelector("span.title a");
		if (!titleElement) return;
		var title = titleElement.textContent.trim();
		var videoUrl = titleElement.getAttribute("href");
		if (!videoUrl) return;
		var thumbnailUrl = extractThumbnail(li);
		var videoId = li.getAttribute("data-video-id");
		if (!videoId) return;
		const durationElement = li.querySelector("var.duration");
		var duration = durationElement ? parseDuration(durationElement.textContent.trim()) : 0;
		const viewsElement = li.querySelector("div.videoDetailsBlock span.views var");
		var views = viewsElement ? parseStringWithKorMSuffixes(viewsElement.textContent.trim()) : 0;
		resultArray.push({ id: videoId, videoUrl: videoUrl, title: title, thumbnailUrl: thumbnailUrl, duration: duration, authorInfo: authorInfo, views: views });
	});
	return { totalElemsPages: total, videos: resultArray };
}

function getPornstarContents(html) {
	var dom = domParser.parseFromString(html);
	const showingInfoElement = dom.querySelector("div.showingInfo");
	var total = 0;
	if (showingInfoElement) {
		var showingInfo = showingInfoElement.textContent.trim();
		if (showingInfo.length > 0 && showingInfo.includes(" of ")) total = parseInt(showingInfo.split(" of ").slice(-1), 10);
	}
	var resultArray = [];
	const nameElement = dom.querySelector("h1[itemprop=name]");
	const avatarElement = dom.querySelector("img#getAvatar");
	var authorInfo = { authorName: nameElement ? nameElement.textContent.trim() : "", avatar: avatarElement ? avatarElement.getAttribute("src") : "" };
	const videoListContainer = dom.querySelector("div.videoUList > ul");
	if (!videoListContainer) return { totalElemsPages: total, videos: resultArray };

	videoListContainer.childNodes.forEach((li) => {
		if (!li) return;
		const titleElement = li.querySelector("span.title a");
		if (!titleElement) return;
		var title = titleElement.textContent.trim();
		var videoUrl = titleElement.getAttribute("href");
		if (!videoUrl) return;
		var thumbnailUrl = extractThumbnail(li);
		var videoId = li.getAttribute("data-video-id");
		if (!videoId) return;
		const durationElement = li.querySelector("var.duration");
		var duration = durationElement ? parseDuration(durationElement.textContent.trim()) : 0;
		const viewsElement = li.querySelector("div.videoDetailsBlock span.views var");
		var views = viewsElement ? parseStringWithKorMSuffixes(viewsElement.textContent.trim()) : 0;
		resultArray.push({ id: videoId, videoUrl: videoUrl, title: title, thumbnailUrl: thumbnailUrl, duration: duration, authorInfo: authorInfo, views: views });
	});
	return { totalElemsPages: total, videos: resultArray };
}

function getModelContents(html) {
	var dom = domParser.parseFromString(html);
	var hasNextPage;
	const pageNext = dom.querySelector("li.page_next > a");
	if (pageNext) hasNextPage = pageNext.getAttribute("href") !== "";
	else hasNextPage = false;
	var resultArray = [];
	const nameElement = dom.querySelector("h1[itemprop=name]");
	const avatarElement = dom.querySelector("img#getAvatar");
	var authorInfo = { authorName: nameElement ? nameElement.textContent.trim() : "", avatar: avatarElement ? avatarElement.getAttribute("src") : "" };
	const videoListContainer = dom.querySelector("div.videoUList > ul");
	if (!videoListContainer) return { hasNextPage: hasNextPage, videos: resultArray };

	videoListContainer.childNodes.forEach((li) => {
		if (!li) return;
		const titleElement = li.querySelector("span.title a");
		if (!titleElement) return;
		var title = titleElement.textContent.trim();
		var videoUrl = titleElement.getAttribute("href");
		if (!videoUrl) return;
		var thumbnailUrl = extractThumbnail(li);
		var videoId = li.getAttribute("data-video-id");
		if (!videoId) return;
		const durationElement = li.querySelector("var.duration");
		var duration = durationElement ? parseDuration(durationElement.textContent.trim()) : 0;
		const viewsElement = li.querySelector("div.videoDetailsBlock span.views var");
		var views = viewsElement ? parseStringWithKorMSuffixes(viewsElement.textContent.trim()) : 0;
		resultArray.push({ id: videoId, videoUrl: videoUrl, title: title, thumbnailUrl: thumbnailUrl, duration: duration, authorInfo: authorInfo, views: views });
	});
	return { hasNextPage: hasNextPage, videos: resultArray };
}

function getVideoPager(path, params, page) {
	params = { ...params, page };
	const url = URL_BASE + path;
	const urlWithParams = `${url}${buildQuery(params)}`;
	var html = httpGET(urlWithParams, { emptyOnNotFound: path === "/video/search" });
	if (html === null) return new PornhubVideoPager([], false, path, params, page);

	var containerId = path.includes("/search") ? "videoSearchResult" : "videoCategory";
	var vids = getVideos(html, containerId);

	return new PornhubVideoPager(vids.videos.map(v => {
		return new PlatformVideo({
			id: new PlatformID(PLATFORM, v.id, config.id),
			name: v.title ?? "",
			thumbnails: new Thumbnails([new Thumbnail(v.thumbnailUrl, 0)]),
			author: new PlatformAuthorLink(new PlatformID(PLATFORM, v.authorInfo.authorName, config.id), v.authorInfo.authorName, v.authorInfo.channel),
			datetime: undefined,
			duration: v.duration,
			viewCount: v.views,
			url: v.videoUrl,
			isLive: false
		});
	}), !!vids.hasNextPage, path, params, page);
}

function getVideos(html, ulId) {
	let node = domParser.parseFromString(html, "text/html");
	var ulElement = node.getElementById(ulId);
	var total = 1;
	var pagingIndicationElement = node.getElementsByClassName("showingCounter")[0];
	if (pagingIndicationElement !== undefined && pagingIndicationElement !== null) {
		var pagingIndication = pagingIndicationElement.textContent.trim();
		if (pagingIndication && typeof pagingIndication === 'string') {
			var totalMatch = pagingIndication.match(/(?:de|of)\s+([0-9,]+)/i);
			if (totalMatch && totalMatch[1]) {
				total = parseInt(totalMatch[1].replace(/,/g, ''), 10);
			}
		}
	}

	var resultArray = [];
	var hasNextPage = false;
	var nextNodes = node.getElementsByClassName("page_next");
	if (nextNodes.length > 0) {
		var nextAnchor = nextNodes[0].querySelector("a");
		hasNextPage = nextAnchor && nextAnchor.getAttribute("href") !== "";
	}

	if (ulElement) {
		const liElements = ulElement.querySelectorAll("li.pcVideoListItem");
		liElements.forEach(function(li) {
			const videoId = li.getAttribute("data-video-id");
			if (videoId && !isNaN(videoId)) {
				const aElement = li.querySelector('a.js-linkVideoThumb');
				if (aElement) {
					const videoUrl = URL_BASE + aElement.getAttribute('href');
					if (videoUrl) {
						let thumbnailUrl = extractThumbnail(li);
						const imgElement = aElement.querySelector('img') || li.querySelector('img');
						const title = imgElement ? (imgElement.getAttribute("alt") || imgElement.getAttribute("data-title")) : aElement.getAttribute("data-title");
						const durationVar = aElement.querySelector(".duration");
						const durationStr = durationVar ? durationVar.textContent.trim() : "0:00";
						const duration = parseDuration(durationStr);
						const viewsSpan = li.querySelector(".views var");
						const viewsStr = viewsSpan ? viewsSpan.textContent.trim() : "0";
						const views = parseNumberSuffix(viewsStr);
						const authorLink = li.querySelector(".usernameWrap a");
						let authorInfo = { channel: "", authorName: "" };
						if (authorLink) {
							authorInfo.channel = URL_BASE + authorLink.getAttribute("href");
							authorInfo.authorName = authorLink.textContent.trim();
						}
						resultArray.push({ id: videoId, videoUrl: videoUrl, title: title, thumbnailUrl: thumbnailUrl, duration: duration, authorInfo: authorInfo, views: views });
					}
				}
			}
		});
	}
	return { totalElemsPages: undefined, hasNextPage: hasNextPage, videos: resultArray };
}

log("Pornhub Script Final v9.9 - Playlist & Shorts robust fix aplicado");
