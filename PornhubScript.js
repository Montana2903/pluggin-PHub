const PORNHUB_BASE_URL = "https://www.pornhub.com";

const BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "es-419,es;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": PORNHUB_BASE_URL + "/",
    "Cookie": "platform=pc; age_verified=1; accessAgeDisclaimerPH=2"
};

function text(node, fallback) {
    if (!node) return fallback || "";
    if (typeof node.text === "string") return node.text.trim();
    if (typeof node.textContent === "string") return node.textContent.trim();
    return fallback || "";
}

function attr(node, name, fallback) {
    if (!node) return fallback || "";
    return node.getAttribute(name) || fallback || "";
}

function absoluteUrl(value) {
    if (!value) return "";
    var valueString = String(value).trim().replace(/&amp;/g, "&");
    if (/^https?:\/\//i.test(valueString)) return valueString;
    if (valueString.indexOf("//") === 0) return "https:" + valueString;
    if (valueString.indexOf("/") === 0) return PORNHUB_BASE_URL + valueString;
    return PORNHUB_BASE_URL + "/" + valueString;
}

function viewKey(url) {
    var match = String(url || "").match(/[?&]viewkey=([^&#]+)/i);
    return match ? match[1] : "";
}

function isChannelUrl(url) {
    return /(?:^|\.)pornhub\.com\/(?:model|pornstar|channel|channels|user)\//i.test(String(url || ""));
}

function isVideoUrl(url) {
    return /\/view_video\.php(?:\?[^#]*&)?viewkey=[^&#]+/i.test(String(url || "")) ||
        /[?&]viewkey=[^&#]+/i.test(String(url || ""));
}

function duration(value) {
    var parts = String(value || "").trim().split(":").map(function (part) {
        return parseInt(part, 10) || 0;
    });
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
}

function numberValue(value) {
    var input = String(value || "").trim().toUpperCase().replace(/,/g, "");
    var multiplier = input.indexOf("B") >= 0 ? 1000000000 : input.indexOf("M") >= 0 ? 1000000 : input.indexOf("K") >= 0 ? 1000 : 1;
    var number = parseFloat(input.replace(/[^0-9.]/g, ""));
    return isNaN(number) ? 0 : Math.floor(number * multiplier);
}

function imageUrl(node) {
    return absoluteUrl(
        attr(node, "data-mediumthumb") ||
        attr(node, "data-thumb_url") ||
        attr(node, "data-thumb") ||
        attr(node, "data-src") ||
        attr(node, "src")
    );
}

function errorPager(message) {
    return new VideoListPager([new PlatformVideo({
        id: "pornhub_error",
        name: "ERROR: " + message,
        url: PORNHUB_BASE_URL,
        thumbnails: new VideoThumbnails([]),
        author: new PlatformAuthorLink(PORNHUB_BASE_URL, "Diagnóstico", PORNHUB_BASE_URL, null),
        duration: 0,
        viewCount: 0,
        isLive: false
    })], false);
}

function request(url) {
    var response = Http.get(url, BROWSER_HEADERS);
    if (!response || !response.isOk) {
        throw new Error("HTTP " + (response ? response.code : "desconocido"));
    }
    if (!response.body || response.body.length < 500) {
        throw new Error("PornHub devolvió una respuesta vacía o bloqueada.");
    }
    var lower = response.body.toLowerCase();
    if (lower.indexOf("captcha") >= 0 || lower.indexOf("access denied") >= 0 ||
        lower.indexOf("verify you are human") >= 0 || lower.indexOf("bot protection") >= 0) {
        throw new Error("PornHub devolvió una página anti-bot.");
    }
    return response.body;
}

function videoFromNode(node) {
    var links = node.querySelectorAll("a");
    var href = "";
    for (var i = 0; i < links.length; i++) {
        var candidate = attr(links[i], "href");
        if (/\/view_video\.php/i.test(candidate) || /[?&]viewkey=/i.test(candidate)) {
            href = candidate;
            break;
        }
    }
    if (!href) return null;

    var url = absoluteUrl(href);
    var id = viewKey(url) || attr(node, "data-video-vkey") || attr(node, "data-video-id");
    if (!id) return null;

    var titleNode = node.querySelector(".vidTitleWrapper .title a, .videoTitle a, .title a, a[title]");
    var authorNode = node.querySelector(".usernameWrap a, .videoUploader a, a[href*='/model/'], a[href*='/pornstar/'], a[href*='/channel'], a[href*='/user/']");
    var durationNode = node.querySelector(".duration, .videoDuration, .durationText, [data-duration]");
    var viewsNode = node.querySelector(".views var, .views, .viewsCount, [data-views]");

    var authorUrl = authorNode ? absoluteUrl(attr(authorNode, "href")) : PORNHUB_BASE_URL + "/channels/";
    return new PlatformVideo({
        id: id,
        name: text(titleNode, text(links[0], "Sin título")),
        url: url,
        thumbnails: new VideoThumbnails([new VideoThumbnail(imageUrl(node.querySelector("img")))]),
        author: new PlatformAuthorLink(authorUrl, text(authorNode, "Desconocido"), authorUrl, null),
        duration: duration(text(durationNode, attr(durationNode, "data-duration", ""))),
        viewCount: numberValue(text(viewsNode, "0")),
        isLive: false
    });
}

function extractVideos(dom) {
    var nodes = dom.querySelectorAll("li.pcVideoListItem, .videoBox, .video-item, .videoPreview, [data-video-vkey], .video-card, .videoListingItem");
    var videos = [];
    var seen = {};
    for (var i = 0; i < nodes.length; i++) {
        try {
            var video = videoFromNode(nodes[i]);
            if (video && !seen[video.id]) {
                seen[video.id] = true;
                videos.push(video);
            }
        } catch (e) {
            log("No se pudo extraer un video: " + e);
        }
    }
    return videos;
}

function searchVideos(query, filters) {
    var url = PORNHUB_BASE_URL + "/video/search?search=" + encodeURIComponent(query || "");
    if (filters) {
        if (filters.duration) url += "&min_duration=" + encodeURIComponent(filters.duration);
        if (filters.quality === "hd") url += "&hd=1";
    }
    var videos = extractVideos(DOMParser.parse(request(url)));
    return videos.length ? new VideoListPager(videos, false) : errorPager("No se encontraron videos en los resultados.");
}

function getHomeVideos() {
    try {
        var videos = extractVideos(DOMParser.parse(request(PORNHUB_BASE_URL + "/video")));
        return videos.length ? new VideoListPager(videos, false) : errorPager("No se encontraron videos en la página principal.");
    } catch (e) {
        return errorPager("Home: " + (e.message || e));
    }
}

function getChannelInfo(url) {
    var dom = DOMParser.parse(request(url));
    var avatarNode = dom.querySelector("#getAvatar img, #getAvatar, .avatar img, .profileAvatar img, img.avatar");
    var bannerNode = dom.querySelector("#coverPictureDefault img, #coverPictureDefault, .cover img, .banner img");
    var descriptionNode = dom.querySelector(".aboutMeText, .bio, .description, .profile-description, .cdescriptions, section.aboutMeSection");
    var nameNode = dom.querySelector("h1[itemprop='name'], h1.name, .channelName, .profile-name, div.name h1, h1");
    return new PlatformChannel({
        id: url,
        name: text(nameNode, "Canal"),
        thumbnail: imageUrl(avatarNode),
        banner: imageUrl(bannerNode),
        url: url,
        description: text(descriptionNode, "")
    });
}

function getChannelVideos(url, page) {
    try {
        var separator = url.indexOf("?") >= 0 ? "&" : "?";
        var videos = extractVideos(DOMParser.parse(request(url + separator + "page=" + (page || 1))));
        return new VideoListPager(videos, videos.length > 0);
    } catch (e) {
        return errorPager("Canal: " + (e.message || e));
    }
}

function balancedObject(textValue, start) {
    var begin = textValue.indexOf("{", start);
    if (begin < 0) return null;
    var depth = 0, quoted = false, escaped = false;
    for (var i = begin; i < textValue.length; i++) {
        var ch = textValue[i];
        if (quoted) {
            if (escaped) escaped = false;
            else if (ch === "\\") escaped = true;
            else if (ch === "\"") quoted = false;
        } else if (ch === "\"") quoted = true;
        else if (ch === "{") depth++;
        else if (ch === "}" && --depth === 0) return textValue.substring(begin, i + 1);
    }
    return null;
}

function playerConfig(body) {
    var patterns = [/var\s+flashvars_\d+\s*=\s*/i, /var\s+flashvars\s*=\s*/i, /flashvars_\d+\s*=\s*/i];
    for (var i = 0; i < patterns.length; i++) {
        var match = body.match(patterns[i]);
        if (!match) continue;
        var json = balancedObject(body, match.index);
        if (json) {
            try { return JSON.parse(json); } catch (e) {}
        }
    }
    var result = {};
    var video = body.match(/["']video_url["']\s*:\s*["']([^"']+)["']/i);
    var title = body.match(/["']video_title["']\s*:\s*["']([^"']*)["']/i);
    var image = body.match(/["']image_url["']\s*:\s*["']([^"']*)["']/i);
    if (video) result.video_url = video[1];
    if (title) result.video_title = title[1];
    if (image) result.image_url = image[1];
    return result;
}

function getVideoDetailsInfo(url) {
    var config = playerConfig(request(url));
    var sources = [];
    var definitions = config.mediaDefinitions || [];
    for (var i = 0; i < definitions.length; i++) {
        var media = definitions[i] || {};
        var mediaUrl = media.videoUrl || media.video_url || media.url;
        if (!mediaUrl) continue;
        var quality = parseInt(media.quality || media.height || 0, 10) || 0;
        sources.push(new VideoSource({
            url: mediaUrl,
            quality: quality ? quality + "p" : "Auto",
            format: media.format || "mp4",
            width: parseInt(media.width || 0, 10) || 0,
            height: quality
        }));
    }
    if (!sources.length && config.videoUrl) sources.push(new VideoSource({ url: config.videoUrl, quality: "Auto", format: "mp4", width: 0, height: 0 }));
    if (!sources.length && config.video_url) sources.push(new VideoSource({ url: config.video_url, quality: "Auto", format: "mp4", width: 0, height: 0 }));
    if (!sources.length) throw new Error("No se pudieron extraer fuentes de video.");

    var subtitles = [];
    var captions = config.closedCaptionsFile || config.closed_captions || config.subtitleUrl;
    if (captions) subtitles.push(new SubtitleSource({ url: captions, name: "Subtítulos", format: "vtt" }));
    return new VideoDetails({
        id: config.video_id || config.video_url || viewKey(url) || url,
        name: config.video_title || config.title || "Video",
        url: url,
        videoSources: sources,
        subtitles: subtitles,
        author: new PlatformAuthorLink("", "Autor", "", null),
        description: config.description || "",
        thumbnails: new VideoThumbnails([new VideoThumbnail(absoluteUrl(config.image_url || config.imageUrl || ""))])
    });
}

// Grayjay source API: these assignments are required for URL matching and dispatch.
source.isChannelUrl = function (url) { return isChannelUrl(url); };
source.getChannel = function (url) { return getChannelInfo(url); };
source.getChannelContents = function (url, type, order, filters) { return getChannelVideos(url, 1); };
source.isContentDetailsUrl = function (url) { return isVideoUrl(url); };
source.getContentDetails = function (url) { return getVideoDetailsInfo(url); };
source.search = function (query, type, order, filters) { return searchVideos(query, filters); };
source.getHome = function () { return getHomeVideos(); };
source.getSearchCapabilities = function () {
    return { types: [Type.Feed.Mixed], sorts: [Type.Order.Chronological], filters: [
        { id: "duration", type: "DropdownFilter", name: "Duración", options: [
            { id: "", name: "Cualquiera" }, { id: "10", name: "Hasta 10 minutos" },
            { id: "20", name: "Hasta 20 minutos" }, { id: "30", name: "Más de 20 minutos" }
        ], defaultOption: "" },
        { id: "quality", type: "DropdownFilter", name: "Calidad", options: [
            { id: "", name: "Todas" }, { id: "hd", name: "HD" }
        ], defaultOption: "" }
    ] };
};

log("PornHub Plugin v9 loaded");
