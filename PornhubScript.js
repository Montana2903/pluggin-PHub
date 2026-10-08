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
	const attributes = ["data-src", "data-thumb_url", "data-mediumthumb", "data-image", "data-thumb", "data-poster", "data-path", "src"];
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

	const attributes = ["data-image", "data-thumb_url", "data-src", "data-mediumthumb", "data-thumb", "data-poster", "data-path", "src"];

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
		let match = style.match(/url\((['"])?(.+?)\1\)/);
		if (match && match[2] && !match[2].includes("1x1.gif") && !match[2].startsWith("data:image/")) {
			return absolutePlatformUrl(match[2]);
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
	return { types: [Type.Feed.Mixed], sorts: [Type.Order.Chronological], filters: [] };
};

source.getHome = function(type, filters) {
	return getVideoPager('/video', {}, 1);
};

source.searchSuggestions = function(query) {
	if(query.length < 1) return [];

	try {
		var apiUrl = URL_BASE + "/api/v1/video/search_autocomplete?pornstars=true&token=" + state.token + "&orientation=straight&q=" + encodeURIComponent(query) + "&alt=0";
		log("Fetching autocomplete: " + apiUrl);

		var json = httpGET(apiUrl, {
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

		if (!json || json.length === 0) {
			log("Empty autocomplete JSON");
			return [];
		}

		var suggestions = [];

		if (json.queries && Array.isArray(json.queries)) {
			suggestions = suggestions.concat(json.queries);
		}

		if (json.models && Array.isArray(json.models)) {
			json.models.forEach(function(model) {
				suggestions.push("@" + model.name);
			});
		}

		if (json.pornstars && Array.isArray(json.pornstars)) {
			json.pornstars.forEach(function(pornstar) {
				suggestions.push("@" + pornstar.name);
			});
		}

		if (json.channels && Array.isArray(json.channels)) {
			json.channels.forEach(function(channel) {
				suggestions.push("#" + channel.name);
			});
		}

		log("Autocomplete returned " + suggestions.length + " total suggestions");
		return suggestions;
	} catch(e) {
		log("Search suggestions failed: " + e);
		return [];
	}
};

source.getSearchCapabilities = () => {
	return {
		types: [Type.Feed.Mixed],
		sorts: [Type.Order.Chronological],
		filters: []
	};
};

source.search = function (query, type, order, filters) {
	const section = selectedFilterValue(filters, "section");
	const params = {};
	if (query) params.search = query;
	if (section) params[query ? "filter_category" : "c"] = section;
	return getVideoPager(query ? "/video/search" : "/video", params, 1);
};

source.getSearchChannelContentsCapabilities = function() {
	return { types: [Type.Feed.Mixed], sorts: [Type.Order.Chronological], filters: [] };
};

source.searchChannelContents = function(channelUrl, query, type, order, filters) {
	throw new ScriptException("This is a sample");
};

source.searchChannels = function(query) {
	return getAutocompleteChannelPager(query);
};

source.isChannelUrl = function(url) {
	return url.includes(".pornhub.com/model/") || url.includes(".pornhub.com/channels/") || url.includes(".pornhub.com/pornstar/");
};

source.getChannel = function(url) {
	if (!url.startsWith("htt")) {
		url = URL_BASE + url;
	}

	url = normalizePornhubUrl(url);

	var channelUrlName = url.split("/")[4]

	var info;
	if(url.includes("/channels/")) {
		info = getChannelInfo(url);
	} else {
		info = getPornstarInfo(url);
	}

    return new PlatformChannel({
        id: new PlatformID(PLATFORM, channelUrlName, config.id, PLATFORM_CLAIMTYPE),
        name: info.channelName,
        thumbnail: info.channelThumbnail,
        banner: info.channelBanner,
        subscribers: info.channelSubscribers,
        description: info.channelDescription,
        url: info.channelUrl,
        links: info.channelLinks
    })
}

source.getChannelContents = function(url, type, order, filters) {
	url = normalizePornhubUrl(url);

	if(url.includes("/channels/")) {
		return getChannelVideosPager(url + "/videos", {}, 1);
	} else if(url.includes("/model/")){
		return getModelVideosPager(url + "/videos", {}, 1);
	} else {
		return getPornstarVideosPager(url + "/videos/upload", {}, 1);
	}
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
	if (!/^\/playlist(?:[?#]|$)/i.test(relative)) return "";
	var queryMatch = relative.match(/[?&]id=(\d+)(?:[&#]|$)/i);
	return queryMatch ? queryMatch[1] : "";
}

function playlistVideoFromParsed(video) {
	var authorInfo = video.authorInfo || {};
	var authorName = authorInfo.authorName || "";
	var authorUrl = absolutePlatformUrl(authorInfo.channel || "");
	return new PlatformVideo({
		id: new PlatformID(PLATFORM, String(video.id || video.videoUrl || ""), config.id),
		name: video.title || "",
		thumbnails: new Thumbnails([new Thumbnail(video.thumbnailUrl || "", 0)]),
		author: new PlatformAuthorLink(
			new PlatformID(PLATFORM, authorName || authorUrl, config.id),
			authorName,
			authorUrl,
			authorInfo.avatar || ""
		),
		datetime: undefined,
		duration: video.duration || 0,
		viewCount: video.views || 0,
		url: absolutePlatformUrl(video.videoUrl || ""),
		isLive: false
	});
}

function extractEmbeddedJsonArray(html, keys) {
	if (!html || !keys || !Array.isArray(keys)) return [];
	const regex = new RegExp(`"(${keys.join("|")})"\\s*:\\s*(\\[.*?\\])`, "i");
	const match = html.match(regex);
	if (!match || !match[2]) return [];
	try {
		return JSON.parse(match[2]);
	} catch (e) {
		return [];
	}
}

function extractPlaylistVideosFromHtml(html) {
	const videos = extractEmbeddedJsonArray(html, ["mediaDefinitions", "videos"]);
	return Array.isArray(videos) ? videos : [];
}

function parsePlaylistPage(html, playlistUrl, playlistId) {
	var dom = domParser.parseFromString(html, "text/html");
	var wrapper = dom.getElementById("playlistWrapper");
	var titleNode = dom.querySelector("h1#watchPlaylist, h1.playlistTitle");
	var title = titleNode ? titleNode.textContent.trim() : "";
	if (!wrapper || !title) {
		throw new ScriptException("This playlist is unavailable, private, or no longer exists.");
	}

	var parsed = getVideos(html, "videoPlaylist").videos || [];
	var seen = {};
	var videos = [];
	parsed.forEach(function(video) {
		var key = String(video.id || video.videoUrl || "");
		if (!key || seen[key] || !video.videoUrl) return;
		seen[key] = true;
		videos.push(playlistVideoFromParsed(video));
	});

	var authorNode = dom.querySelector("#js-aboutPlaylistTabView .usernameWrap a, #playlistWrapper .usernameWrap a");
	var authorName = authorNode ? authorNode.textContent.trim() : "";
	var authorUrl = authorNode ? absolutePlatformUrl(authorNode.getAttribute("href") || "") : "";
	var thumbnail = parsed.length > 0 ? (parsed[0].thumbnailUrl || "") : "";

	return new PlatformPlaylistDetails({
		id: new PlatformID(PLATFORM, "playlist:" + playlistId, config.id),
		name: title,
		thumbnails: new Thumbnails(thumbnail ? [new Thumbnail(thumbnail, 0)] : []),
		thumbnail: thumbnail,
		author: new PlatformAuthorLink(
			new PlatformID(PLATFORM, authorName || authorUrl, config.id),
			authorName,
			authorUrl,
			""
		),
		datetime: 0,
		url: playlistUrl,
		videoCount: videos.length,
		contents: new VideoPager(videos, false)
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
	return { "Referer": url, "User-Agent": headers["User-Agent"], "Origin": URL_BASE };
}

function normalizeMediaDefinitions(mediaDefinitions) {
	if (!Array.isArray(mediaDefinitions)) return [];

	return mediaDefinitions
		.filter(function(def) {
			return def && typeof def === "object";
		})
		.map(function(def) {
			if (def && def.quality && typeof def.quality === "string") {
				def.quality = def.quality.trim();
			}
			if (def && def.videoUrl && typeof def.videoUrl === "string" && !/^https?:\/\//i.test(def.videoUrl)) {
				def.videoUrl = absolutePlatformUrl(def.videoUrl);
			}
			return def;
		})
		.filter(function(def) {
			if (!def || typeof def !== "object") return false;
			var format = String(def.format || "").toLowerCase();
			var quality = String(def.quality || "");
			var hasUrl = typeof def.videoUrl === "string" && def.videoUrl.startsWith("http");
			return (format === "hls" || format === "mp4") && !!supportedResolutions[quality] && hasUrl;
		});
}

function extractFlashvarsFromHtml(html) {
	if (!html || typeof html !== "string") return null;

	var patterns = [
		/(?:var|let|const)\s+flashvars(?:_\d+)?\s*[:=]\s*({[\s\S]*?});/i,
		/(?:window|var)\s*__INITIAL_STATE__\s*[:=]\s*({[\s\S]*?});?/i,
		/(?:window|var)\s*INITIAL_STATE\s*[:=]\s*({[\s\S]*?});?/i,
		/"mediaDefinitions"\s*:\s*(\[[\s\S]*?\])\s*(?:,|\})/i
	];

	for (var i = 0; i < patterns.length; i++) {
		var match = html.match(patterns[i]);
		if (!match || !match[1]) continue;

		try {
			var parsed = JSON.parse(match[1]);

			if (parsed && Array.isArray(parsed.mediaDefinitions)) {
				return parsed;
			}

			if (parsed && parsed.video && Array.isArray(parsed.video.mediaDefinitions)) {
				return parsed.video;
			}

			if (parsed && parsed.data && Array.isArray(parsed.data.mediaDefinitions)) {
				return parsed.data;
			}

			if (parsed && parsed.videos && Array.isArray(parsed.videos)) {
				var nested = parsed.videos.find(function(item) {
					return item && Array.isArray(item.mediaDefinitions);
				});
				if (nested) return nested;
			}
		} catch (e) {
			// siguiente patrón
		}
	}

	try {
		var startIndex = html.indexOf('"mediaDefinitions"');
		if (startIndex !== -1) {
			var arrayStart = html.indexOf('[', startIndex);
			if (arrayStart !== -1) {
				var bracketCount = 0;
				var arrayEnd = -1;
				var inString = false;
				var escapeNext = false;

				for (var j = arrayStart; j < html.length; j++) {
					var ch = html[j];

					if (escapeNext) {
						escapeNext = false;
						continue;
					}
					if (ch === '\\') {
						escapeNext = true;
						continue;
					}
					if (ch === '"' && !escapeNext) {
						inString = !inString;
						continue;
					}
					if (inString) continue;

					if (ch === '[') {
						bracketCount++;
					} else if (ch === ']') {
						bracketCount--;
						if (bracketCount === 0) {
							arrayEnd = j + 1;
							break;
						}
					}
				}

				if (arrayEnd !== -1) {
					var arrayStr = html.substring(arrayStart, arrayEnd);
					var parsedArray = JSON.parse(arrayStr);
					if (Array.isArray(parsedArray)) {
						return { mediaDefinitions: parsedArray };
					}
				}
			}
		}
	} catch (e) {}

	return null;
}

function loadPlaybackPage(url) {
	var lastCode = null;

	for (var attempt = 0; attempt < 4; attempt++) {
		var pageUrl = attempt === 0 ? url : url + (url.includes("?") ? "&" : "?") + "_=" + Date.now() + attempt;

		var html = "";
		try {
			html = httpGET(pageUrl, {});
		} catch (e) {
			lastCode = 500;
			continue;
		}

		var flashvars = extractFlashvarsFromHtml(html);
		if (!flashvars) continue;

		var definitions = normalizeMediaDefinitions(flashvars.mediaDefinitions || []);

		if (!definitions.length) continue;

		definitions = definitions.slice().sort(function(a, b) {
			var aHeight = supportedResolutions[a.quality] ? supportedResolutions[a.quality].height : 0;
			var bHeight = supportedResolutions[b.quality] ? supportedResolutions[b.quality].height : 0;
			return bHeight - aHeight;
		});

		for (var i = 0; i < definitions.length; i++) {
			var def = definitions[i];
			try {
				var manifest = httpGET(def.videoUrl, {
					headers: playbackHeaders(url),
					retries: 2
				});

				if (typeof manifest === "string" && /^#EXTM3U/i.test(manifest.trim())) {
					return {
						html: html,
						flashvars: flashvars,
						definitions: definitions
					};
				}
			} catch (e) {
				lastCode = 500;
			}
		}
	}

	throw new ScriptException("No se pudo resolver un stream HLS válido para este video.");
}

source.getContentDetails = function(url) {
	var page = loadPlaybackPage(url);
	var html = page.html;
	var flashvars = page.flashvars;
	var mediaDefinitions = normalizeMediaDefinitions(page.definitions || flashvars.mediaDefinitions || []);

	var sources = [];
	var defaultSelected = null;

	for (var i = 0; i < mediaDefinitions.length; i++) {
		var def = mediaDefinitions[i];
		var resolution = supportedResolutions[def.quality];
		if (!resolution) continue;

		var isDefault = (def.defaultQuality === true || def.defaultQuality === "true") || defaultSelected === null;
		if (isDefault) defaultSelected = def.quality;

		if (def.format === "hls") {
			sources.push(new HLSSource({
				name: resolution.width + "x" + resolution.height,
				url: def.videoUrl,
				duration: flashvars.video_duration || 0,
				priority: isDefault,
				requestModifier: { headers: playbackHeaders(url) }
			}));
		} else if (def.format === "mp4") {
			sources.push(new VideoSource({
				name: def.quality + "p",
				url: def.videoUrl,
				width: resolution.width,
				height: resolution.height,
				duration: flashvars.video_duration || 0,
				container: "mp4",
				priority: isDefault,
				requestModifier: { headers: playbackHeaders(url) }
			}));
		}
	}

	if (!sources.length) {
		throw new ScriptException("No se encontraron fuentes de reproducción válidas.");
	}

	var ldJson = {};
	try {
		var dom = domParser.parseFromString(html);
		var scriptNode = dom.querySelector('script[type="application/ld+json"]');
		if (scriptNode && scriptNode.textContent) {
			ldJson = JSON.parse(scriptNode.textContent.trim());
		}
	} catch (e) {
		ldJson = {};
	}

	var description = "";
	if (ldJson && ldJson.description) description = ldJson.description;

	var userAvatar = "";
	var channelUrlId = "";
	var displayName = "Unknown";
	var channelUrl = URL_BASE;

	try {
		var dom = domParser.parseFromString(html);
		var userAvatarNode = dom.getElementsByClassName("userAvatar")[0];
		if (userAvatarNode) {
			var img = userAvatarNode.querySelector("img");
			if (img) userAvatar = img.getAttribute("src") || "";
		}

		var userInfoNode = dom.getElementsByClassName("userInfo")[0];
		if (userInfoNode) {
			var link = userInfoNode.querySelector("div.usernameWrap a, a[href*='/model/'], a[href*='/pornstar/'], a[href*='/channels/']");
			if (link) {
				channelUrl = URL_BASE + (link.getAttribute("href") || "");
				channelUrlId = (link.getAttribute("href") || "").split("/").filter(Boolean).pop() || "";
				displayName = link.textContent.trim() || "Unknown";
			}
		}
	} catch (e) {}

	var subscribers = 0;
	try {
		var dom = domParser.parseFromString(html);
		var userInfoNode = dom.getElementsByClassName("userInfo")[0];
		if (userInfoNode) {
			var spans = userInfoNode.querySelectorAll("span");
			for (var j = 0; j < spans.length; j++) {
				var txt = (spans[j].textContent || "").trim();
				if (txt.toLowerCase().indexOf("subscriber") !== -1) {
					subscribers = parseStringWithKorMSuffixes(txt);
					break;
				}
			}
		}
	} catch (e) {}

	var views = 0;
	try {
		views = interactionCountFromLdJson(ldJson);
	} catch (e) {
		views = 0;
	}

	var videoId = "0";
	if (flashvars && flashvars.playbackTracking && flashvars.playbackTracking.video_id) {
		videoId = String(flashvars.playbackTracking.video_id);
	} else if (flashvars && flashvars.video_id) {
		videoId = String(flashvars.video_id);
	}

	var details = new PlatformVideoDetails({
		id: new PlatformID(PLATFORM, videoId, config.id),
		name: flashvars.video_title || "Porn video",
		thumbnails: new Thumbnails([new Thumbnail(flashvars.image_url || "", 0)]),
		author: new PlatformAuthorLink(
			new PlatformID(PLATFORM, channelUrlId || displayName, config.id),
			displayName,
			channelUrl,
			userAvatar || "",
			subscribers || 0
		),
		datetime: Math.round((new Date(ldJson.uploadDate || Date.now())).getTime() / 1000),
		duration: flashvars.video_duration || 0,
		viewCount: views,
		url: flashvars.link_url || url,
		isLive: false,
		description: description,
		video: new VideoSourceDescriptor(sources)
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

	if (liElements.length === 0) {
		log("No recommendations found");
		return new ContentPager([], false);
	}

	var resultArray = [];

	liElements.forEach(function (li) {
		const videoId = li.getAttribute("data-video-id");
		if (videoId && !isNaN(videoId)) {
			const aElement = li.querySelector('a.thumbnailTitle, a[href*="view_video"]');
			if (aElement) {
				const videoUrl = aElement.getAttribute('href');
				const imgElement = li.querySelector('img');
				if (imgElement && videoUrl) {
					const thumbnailUrl = imageUrl(imgElement);
					const title = aElement.getAttribute("title") || aElement.textContent.trim() || imgElement.getAttribute("alt");
					const durationVar = li.querySelector(".duration, var.duration");
					const durationStr = durationVar ? durationVar.textContent.trim() : "0:00";
					const duration = parseDuration(durationStr);
					const viewsSpan = li.querySelector(".views var, .views");
					const viewsStr = viewsSpan ? viewsSpan.textContent.trim() : "0";
					const views = viewsStr && viewsStr.includes("K") || viewsStr.includes("M") ? parseNumberSuffix(viewsStr) : 0;

					const authorLink = li.querySelector(".usernameWrap a, a[href*='/model/'], a[href*='/pornstar/'], a[href*='/channels/']");
					let authorInfo = {
						channel: "",
						authorName: ""
					};
					if (authorLink) {
						authorInfo.channel = URL_BASE + authorLink.getAttribute("href");
						authorInfo.authorName = authorLink.textContent.trim();
					}

					resultArray.push(new PlatformVideo({
						id: new PlatformID(PLATFORM, videoId, config.id),
						name: title ?? "",
						thumbnails: new Thumbnails([new Thumbnail(thumbnailUrl, 0)]),
						author: new PlatformAuthorLink(new PlatformID(PLATFORM, authorInfo.authorName, config.id),
							authorInfo.authorName,
							authorInfo.channel,
							""),
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

	log(`Found ${resultArray.length} recommendations`);
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
		} catch (e) {
			// Use defaults
		}
	} else if (context) {
		from = context.from ?? 1;
		count = context.count ?? 12;
	}

	return getShortsPager(from, count);
};

function extractShortsArrayFromHtml(html) {
	try {
		var match = html.match(/JSON_SHORTIES\s*=\s*(\[[\s\S]*?\]);/);
		if (match && match[1]) {
			return JSON.parse(match[1]);
		}
	} catch (e) {
		log("Failed to extract shorts array: " + e);
	}
	return [];
}

function getShortsPager(from, count) {
	log(`getShortsPager from=${from} count=${count}`);

	const url = URL_BASE + "/shorties";

	var html = httpGET(url, {});

	var shortsArray = extractShortsArrayFromHtml(html);
	if (!shortsArray || shortsArray.length === 0) {
		log("No shorts found in page");
		return new PornhubVideoPager([], false, "/shorties", {}, 1);
	}

	var results = [];
	shortsArray.slice(0, count).forEach(function(short) {
		if (short && short.id && short.title) {
			results.push(new PlatformVideo({
				id: new PlatformID(PLATFORM, String(short.id), config.id),
				name: short.title,
				thumbnails: new Thumbnails([new Thumbnail(short.thumb || "", 0)]),
				author: new PlatformAuthorLink(new PlatformID(PLATFORM, short.author || "", config.id), short.author || "", "", ""),
				datetime: undefined,
				duration: short.duration || 0,
				viewCount: short.views || 0,
				url: URL_BASE + "/view_video.php?viewkey=" + short.id,
				isLive: false
			}));
		}
	});

	return new PornhubVideoPager(results, false, "/shorties", {}, 1);
}

function isBotChallenge(html) {
	return html.includes("function leastFactor(n)") && html.includes("document.cookie=\"KEY=");
}

function solveBotChallenge(html) {
	log("Bot challenge detected");
	throw new ScriptException("Bot challenge detected. Please try again later.");
}

function refreshSession() {
	state.token = "";
	state.sessionCookie = "";
	log("Session refreshed");
}

function httpGET(url, options = {}) {
	if (!url) throw new ScriptException("URL cannot be empty");

	options = options || {};
	var opts = {
		headers: options.headers || headers,
		retries: options.retries || 3
	};

	var html = "";
	for (var attempt = 0; attempt < (opts.retries || 1); attempt++) {
		try {
			var response = http.GET(url, opts.headers || headers);
			if (response.isOk) {
				html = response.body;
				break;
			} else if (response.code === 401 || response.code === 403 || response.code === 410) {
				refreshSession();
				throw new ScriptException("Session expired");
			}
		} catch (e) {
			if (attempt === (opts.retries || 1) - 1) {
				throw e;
			}
		}
	}

	if (isBotChallenge(html)) {
		solveBotChallenge(html);
	}

	return html;
}

source.getComments = function(url) {
	return getCommentPager(url, {}, 1);
};

source.getSubComments = function(comment) {
	return getCommentPager(comment.url, {}, 1);
};

function getCommentPager(path, params, page) {
	var offset = (page - 1) * 20;
	params = params || {};
	params.offset = offset;
	params.limit = 20;

	var url = URL_BASE + path + buildQuery(params);
	var html = httpGET(url, {});
	var comments = getComments(html);

	var hasMore = comments.length >= 20;
	return new PornhubCommentPager(comments, hasMore, path, params, page);
}

function getComments(html) {
	var dom = domParser.parseFromString(html);
	var commentElements = dom.querySelectorAll(".comment");

	var comments = [];
	commentElements.forEach(function(el) {
		var author = el.querySelector(".commentAuthor")?.textContent?.trim() || "";
		var text = el.querySelector(".commentMessage")?.textContent?.trim() || "";
		var date = el.querySelector(".commentDate")?.textContent?.trim() || "";

		if (author && text) {
			comments.push(new PlatformComment({
				author: new PlatformAuthorLink(new PlatformID(PLATFORM, author, config.id), author, "", ""),
				message: text,
				rating: 0,
				url: ""
			}));
		}
	});

	return comments;
}

function normalizePornhubUrl(url) {
	if (!url) return url;
	return url.replace(/https?:\/\/([a-z]{2}\.)?pornhub\.com/, "https://www.pornhub.com");
}

function extractPlatformName(url, label) {
	if (!url) return label || "";
	var match = url.match(/pornhub\.com\/([^/?#]+)\/([^/?#]+)/);
	return match ? match[2] : label || "";
}

function parseRelativeDate(relativeDate) {
	if (!relativeDate) return 0;
	var now = Math.floor(Date.now() / 1000);
	var str = String(relativeDate).toLowerCase().trim();

	var match = str.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?/);
	if (!match) return now;

	var value = parseInt(match[1]);
	var unit = match[2];

	var secondsAgo = 0;
	if (unit === "second") secondsAgo = value;
	else if (unit === "minute") secondsAgo = value * 60;
	else if (unit === "hour") secondsAgo = value * 3600;
	else if (unit === "day") secondsAgo = value * 86400;
	else if (unit === "week") secondsAgo = value * 604800;
	else if (unit === "month") secondsAgo = value * 2592000;
	else if (unit === "year") secondsAgo = value * 31536000;

	return now - secondsAgo;
}

function getChannelInfo(url) {
	var html = httpGET(url, {});
	var dom = domParser.parseFromString(html);

	var channelName = dom.querySelector("h1.title")?.textContent?.trim() || "";
	var channelThumbnail = imageUrl(dom.querySelector(".avatarBx img"));
	var channelBanner = imageUrl(dom.querySelector(".bannerBx img"));
	var subscribersStr = dom.querySelector(".subscribers")?.textContent?.trim() || "0";
	var channelSubscribers = parseStringWithKorMSuffixes(subscribersStr);
	var channelDescription = dom.querySelector(".description")?.textContent?.trim() || "";

	return {
		channelName: channelName,
		channelThumbnail: channelThumbnail,
		channelBanner: channelBanner,
		channelSubscribers: channelSubscribers,
		channelDescription: channelDescription,
		channelUrl: normalizePornhubUrl(url),
		channelLinks: []
	};
}

function getPornstarInfo(url) {
	var html = httpGET(url, {});
	var dom = domParser.parseFromString(html);

	var channelName = dom.querySelector("h1.title")?.textContent?.trim() || "";
	var channelThumbnail = imageUrl(dom.querySelector(".avatarBx img"));
	var channelBanner = imageUrl(dom.querySelector(".bannerBx img"));
	var followersStr = dom.querySelector(".followers")?.textContent?.trim() || "0";
	var channelSubscribers = parseStringWithKorMSuffixes(followersStr);
	var channelDescription = dom.querySelector(".description")?.textContent?.trim() || "";

	return {
		channelName: channelName,
		channelThumbnail: channelThumbnail,
		channelBanner: channelBanner,
		channelSubscribers: channelSubscribers,
		channelDescription: channelDescription,
		channelUrl: normalizePornhubUrl(url),
		channelLinks: []
	};
}

class PornhubVideoPager extends VideoPager {
	constructor(results, hasMore, path, params, page) { super(results, !!hasMore, { path, params, page }); }
	nextPage() {
		return getVideoPager(this.context.path, this.context.params, (this.context.page ?? 1) + 1);
	}
}

class PornhubChannelVideosPager extends VideoPager {
	constructor(results, hasMore, path, params, page) { super(results, !!hasMore, { path, params, page }); }
	nextPage() {
		return getChannelVideosPager(this.context.path, this.context.params, (this.context.page ?? 1) + 1);
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
	return getMultiChannelPager(query, 1);
}

function getMultiChannelPager(query, page) {
	var url = URL_BASE + "/api/v1/channel/search_autocomplete?q=" + encodeURIComponent(query) + "&token=" + state.token;
	var html = httpGET(url, {});

	var results = [];
	try {
		var json = JSON.parse(html);
		if (json.channels && Array.isArray(json.channels)) {
			json.channels.forEach(function(ch) {
				results.push(new PlatformChannel({
					id: new PlatformID(PLATFORM, ch.id || ch.name || "", config.id),
					name: ch.name || "",
					thumbnail: ch.thumb || "",
					banner: "",
					subscribers: ch.subscribers || 0,
					description: "",
					url: URL_BASE + (ch.url || ""),
					links: []
				}));
			});
		}
	} catch (e) {
		log("Failed to parse channels: " + e);
	}

	return new PornhubMultiChannelPager(results, false, query, page);
}

function getPornstarsFromSearch(html) {
	var dom = domParser.parseFromString(html);
	var results = [];

	var pornstarElements = dom.querySelectorAll(".pornstarCard, .modelCard");
	pornstarElements.forEach(function(el) {
		var nameEl = el.querySelector("h2, .name");
		var name = nameEl ? nameEl.textContent.trim() : "";
		var linkEl = el.querySelector("a");
		var url = linkEl ? linkEl.getAttribute("href") : "";

		if (name && url) {
			results.push(new PlatformChannel({
				id: new PlatformID(PLATFORM, name, config.id),
				name: name,
				thumbnail: imageUrl(el.querySelector("img")),
				banner: "",
				subscribers: 0,
				description: "",
				url: absolutePlatformUrl(url),
				links: []
			}));
		}
	});

	return results;
}

function getChannelPager(path, params, page) {
	var offset = (page - 1) * 20;
	params = params || {};
	params.offset = offset;
	params.limit = 20;

	var url = URL_BASE + path + buildQuery(params);
	var html = httpGET(url, {});
	var channels = getChannels(html);

	var hasMore = channels.length >= 20;
	return new PornhubChannelPager(channels, hasMore, path, params, page);
}

function getChannels(html) {
	var dom = domParser.parseFromString(html);
	var results = [];

	var channelElements = dom.querySelectorAll(".channelCard, .channel");
	channelElements.forEach(function(el) {
		var nameEl = el.querySelector("h2, .name");
		var name = nameEl ? nameEl.textContent.trim() : "";
		var linkEl = el.querySelector("a");
		var url = linkEl ? linkEl.getAttribute("href") : "";

		if (name && url) {
			results.push(new PlatformChannel({
				id: new PlatformID(PLATFORM, name, config.id),
				name: name,
				thumbnail: imageUrl(el.querySelector("img")),
				banner: "",
				subscribers: 0,
				description: "",
				url: absolutePlatformUrl(url),
				links: []
			}));
		}
	});

	return results;
}

function getChannelVideosPager(path, params, page) {
	var offset = (page - 1) * 20;
	params = params || {};
	params.offset = offset;
	params.limit = 20;

	var url = path + buildQuery(params);
	var html = httpGET(url, {});
	var videos = getVideos(html, "videoPlaylist").videos || [];

	var hasMore = videos.length >= 20;
	return new PornhubChannelVideosPager(videos, hasMore, path, params, page);
}

function getModelVideosPager(path, params, page) {
	var offset = (page - 1) * 20;
	params = params || {};
	params.offset = offset;
	params.limit = 20;

	var url = path + buildQuery(params);
	var html = httpGET(url, {});
	var videos = getVideos(html, "videoPlaylist").videos || [];

	var hasMore = videos.length >= 20;
	return new PornhubChannelVideosPager(videos, hasMore, path, params, page);
}

function getPornstarVideosPager(path, params, page) {
	var offset = (page - 1) * 20;
	params = params || {};
	params.offset = offset;
	params.limit = 20;

	var url = path + buildQuery(params);
	var html = httpGET(url, {});
	var videos = getVideos(html, "videoPlaylist").videos || [];

	var hasMore = videos.length >= 20;
	return new PornhubChannelVideosPager(videos, hasMore, path, params, page);
}

function _buildPornhubChannelVideosPager(vids, hasNextPage, path, params, page) {
	var videos = [];
	vids.forEach(function(v) {
		if (v) {
			videos.push(new PlatformVideo({
				id: new PlatformID(PLATFORM, String(v.id || v.videoUrl || ""), config.id),
				name: v.title || "",
				thumbnails: new Thumbnails([new Thumbnail(v.thumbnailUrl || "", 0)]),
				author: new PlatformAuthorLink(new PlatformID(PLATFORM, v.authorName || "", config.id), v.authorName || "", v.authorUrl || "", ""),
				datetime: undefined,
				duration: v.duration || 0,
				viewCount: v.views || 0,
				url: absolutePlatformUrl(v.videoUrl || ""),
				isLive: false
			}));
		}
	});

	return new PornhubChannelVideosPager(videos, hasNextPage, path, params, page);
}

function getChannelContents(html) {
	var videos = getVideos(html, "videoPlaylist").videos || [];
	return videos;
}

function getPornstarContents(html) {
	var videos = getVideos(html, "videoPlaylist").videos || [];
	return videos;
}

function getModelContents(html) {
	var videos = getVideos(html, "videoPlaylist").videos || [];
	return videos;
}

function getVideoPager(path, params, page) {
	var offset = (page - 1) * 20;
	params = params || {};
	params.offset = offset;
	params.limit = 20;

	var url = URL_BASE + path + buildQuery(params);
	var html = httpGET(url, {});
	var videos = getVideos(html, "videoPlaylist").videos || [];

	var hasMore = videos.length >= 20;
	return new PornhubVideoPager(videos, hasMore, path, params, page);
}

function getVideos(html, ulId) {
	var dom = domParser.parseFromString(html);

	var videoList = dom.getElementById(ulId) || dom.querySelector("ul.videoList, .videos");
	if (!videoList) return { videos: [] };

	var liElements = videoList.querySelectorAll("li");
	var videos = [];

	liElements.forEach(function(li) {
		var videoId = li.getAttribute("data-video-id");
		var linkElement = li.querySelector("a.thumbnailTitle, a[href*='view_video']");

		if (!videoId || !linkElement) return;

		var title = linkElement.getAttribute("title") || linkElement.textContent.trim() || "";
		var videoUrl = linkElement.getAttribute("href") || "";
		var thumbnailUrl = extractThumbnail(li);

		var durationEl = li.querySelector(".duration, var.duration");
		var durationStr = durationEl ? durationEl.textContent.trim() : "0:00";
		var duration = parseDuration(durationStr);

		var viewsEl = li.querySelector(".views, .views var");
		var viewsStr = viewsEl ? viewsEl.textContent.trim() : "0";
		var views = viewsStr ? parseNumberSuffix(viewsStr) : 0;

		var authorLink = li.querySelector(".usernameWrap a, a[href*='/model/'], a[href*='/pornstar/'], a[href*='/channels/']");
		var authorName = authorLink ? authorLink.textContent.trim() : "";
		var authorUrl = authorLink ? URL_BASE + (authorLink.getAttribute("href") || "") : "";

		videos.push(new PlatformVideo({
			id: new PlatformID(PLATFORM, videoId, config.id),
			name: title,
			thumbnails: new Thumbnails([new Thumbnail(thumbnailUrl, 0)]),
			author: new PlatformAuthorLink(new PlatformID(PLATFORM, authorName || videoId, config.id), authorName, authorUrl, ""),
			datetime: undefined,
			duration: duration,
			viewCount: views,
			url: videoUrl.startsWith("http") ? videoUrl : URL_BASE + videoUrl,
			isLive: false
		}));
	});

	return { videos: videos };
}
