const PORNHUB_BASE_URL = "https://www.pornhub.com";

const BROWSER_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "es-419,es;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": PORNHUB_BASE_URL + "/",
    "Cookie": "platform=pc; age_verified=1; accessAgeDisclaimerPH=2"
};

const domParser =
    (typeof globalThis !== "undefined" && globalThis.domParser) ||
    {
        parseFromString: function (html, type) {
            return {
                querySelectorAll: function () { return []; },
                querySelector: function () { return null; },
                getElementById: function () { return null; },
                getElementsByClassName: function () { return []; }
            };
        }
    };

function getNodeText(node, fallback) {
    if (!node) return fallback || "";
    if (typeof node.text === "string") return node.text.trim();
    if (typeof node.textContent === "string") return node.textContent.trim();
    return fallback || "";
}

function getNodeAttribute(node, attribute, fallback) {
    if (!node) return fallback || "";
    return node.getAttribute(attribute) || fallback || "";
}

function absoluteUrl(value) {
    if (!value) return "";
    var cleaned = String(value).trim().replace(/&amp;/g, "&");
    if (/^https?:\/\//i.test(cleaned)) return cleaned;
    if (cleaned.indexOf("//") === 0) return "https:" + cleaned;
    if (cleaned.indexOf("/") === 0) return PORNHUB_BASE_URL + cleaned;
    return PORNHUB_BASE_URL + "/" + cleaned;
}

function getViewKey(url) {
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

function parseDuration(value) {
    var parts = String(value || "").trim().split(":").map(function (part) {
        return parseInt(part, 10) || 0;
    });
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
}

function parseNumberSuffix(value) {
    var input = String(value || "").trim().toUpperCase().replace(/,/g, "");
    var multiplier = 1;
    if (input.indexOf("B") >= 0) multiplier = 1000000000;
    else if (input.indexOf("M") >= 0) multiplier = 1000000;
    else if (input.indexOf("K") >= 0) multiplier = 1000;
    var number = parseFloat(input.replace(/[^0-9.]/g, ""));
    return isNaN(number) ? 0 : Math.floor(number * multiplier);
}

function errorPager(message) {
    return new VideoPager([
        new PlatformVideo({
            id: "pornhub_error",
            name: "ERROR: " + message,
            url: PORNHUB_BASE_URL,
            thumbnails: [],
            author: new PlatformAuthorLink(PORNHUB_BASE_URL, "Diagnóstico", PORNHUB_BASE_URL, null),
            duration: 0,
            viewCount: 0,
            isLive: false
        })
    ], false);
}

function requestPage(url) {
    var response = http.GET(url, BROWSER_HEADERS);
    if (!response || !response.isOk) {
        throw new Error("HTTP " + (response ? response.code : "desconocido"));
    }
    if (!response.body || response.body.length < 500) {
        throw new Error("PornHub devolvió una respuesta vacía o bloqueada.");
    }
    var lower = response.body.toLowerCase();
    if (
        lower.indexOf("captcha") >= 0 ||
        lower.indexOf("access denied") >= 0 ||
        lower.indexOf("verify you are human") >= 0 ||
        lower.indexOf("bot protection") >= 0
    ) {
        throw new Error("PornHub devolvió una página anti-bot.");
    }
    return response.body;
}

function getImageUrl(node) {
    return absoluteUrl(
        getNodeAttribute(node, "data-mediumthumb", "") ||
        getNodeAttribute(node, "data-thumb_url", "") ||
        getNodeAttribute(node, "data-thumb", "") ||
        getNodeAttribute(node, "data-src", "") ||
        getNodeAttribute(node, "src", "")
    );
}

function buildVideoFromNode(node) {
    var links = node.querySelectorAll("a");
    var href = "";

    for (var i = 0; i < links.length; i++) {
        var candidate = getNodeAttribute(links[i], "href", "");
        if (candidate && (/\/view_video\.php/i.test(candidate) || /[?&]viewkey=/i.test(candidate))) {
            href = candidate;
            break;
        }
    }
    if (!href) return null;

    var url = absoluteUrl(href);
    var id = getViewKey(url) || getNodeAttribute(node, "data-video-vkey", "") || getNodeAttribute(node, "data-video-id", "");
    if (!id) return null;

    var titleNode = node.querySelector(".vidTitleWrapper .title a, .videoTitle a, .title a, a[title]") || links[0];
    var authorNode = node.querySelector(".usernameWrap a, .videoUploader a, a[href*='/model/'], a[href*='/pornstar/'], a[href*='/channel'], a[href*='/user/']");
    var durationNode = node.querySelector(".duration, .videoDuration, .durationText, [data-duration]");
    var viewsNode = node.querySelector(".views var, .views, .viewsCount, [data-views]");
    var imageNode = node.querySelector("img[data-mediumthumb], img[data-thumb], img[data-src], img");
    var authorUrl = authorNode ? absoluteUrl(getNodeAttribute(authorNode, "href", "")) : PORNHUB_BASE_URL + "/channels/";

    return new PlatformVideo({
        id: id,
        name: getNodeText(titleNode, "Sin título"),
        url: url,
        thumbnails: [getImageUrl(imageNode)],
        author: new PlatformAuthorLink(authorUrl, getNodeText(authorNode, "Desconocido"), authorUrl, null),
        duration: parseDuration(getNodeText(durationNode, "0:00")),
        viewCount: parseNumberSuffix(getNodeText(viewsNode, "0")),
        isLive: false
    });
}

function extractVideosFromDom(doc) {
    var nodes = doc.querySelectorAll("li.pcVideoListItem, .videoBox, .video-item, .videoPreview, [data-video-vkey], .video-card, .videoListingItem");
    var videos = [];
    var seen = {};

    for (var i = 0; i < nodes.length; i++) {
        try {
            var video = buildVideoFromNode(nodes[i]);
            if (video && !seen[video.id]) {
                seen[video.id] = true;
                videos.push(video);
            }
        } catch (e) {
            log("No se pudo extraer video: " + e);
        }
    }
    return videos;
}

function getHomePage() {
    try {
        var doc = domParser.parseFromString(requestPage(PORNHUB_BASE_URL + "/video"), "text/html");
        var videos = extractVideosFromDom(doc);
        return videos.length ? new VideoPager(videos, false) : errorPager("No se encontraron videos en la página principal.");
    } catch (e) {
        return errorPager("Home: " + (e.message || String(e)));
    }
}

function searchPage(query, filters) {
    try {
        var url = PORNHUB_BASE_URL + "/video/search?search=" + encodeURIComponent(query || "");
        if (filters) {
            if (filters.duration) url += "&min_duration=" + encodeURIComponent(filters.duration);
            if (filters.quality === "hd") url += "&hd=1";
        }

        var doc = domParser.parseFromString(requestPage(url), "text/html");
        var videos = extractVideosFromDom(doc);
        return videos.length ? new VideoPager(videos, false) : errorPager("No se encontraron videos en los resultados.");
    } catch (e) {
        return errorPager("Búsqueda: " + (e.message || String(e)));
    }
}

function getChannelPage(url) {
    try {
        var doc = domParser.parseFromString(requestPage(url), "text/html");
        var nameNode = doc.querySelector("h1[itemprop='name'], h1.name, .channelName, .profile-name, div.name h1, h1");
        var avatarNode = doc.querySelector("#getAvatar img, #getAvatar, .avatar img, .profileAvatar img, img.avatar");
        var bannerNode = doc.querySelector("#coverPictureDefault img, #coverPictureDefault, .cover img, .banner img");
        var descriptionNode = doc.querySelector(".aboutMeText, .bio, .description, .profile-description, .cdescriptions, section.aboutMeSection");

        return new PlatformChannel({
            id: url,
            name: getNodeText(nameNode, "Canal"),
            thumbnail: getImageUrl(avatarNode),
            banner: getImageUrl(bannerNode),
            url: url,
            description: getNodeText(descriptionNode, "")
        });
    } catch (e) {
        throw new Error("Fallo al cargar perfil: " + (e.message || String(e)));
    }
}

function getChannelContentsPage(url, page) {
    try {
        var currentPage = page || 1;
        var separator = url.indexOf("?") >= 0 ? "&" : "?";
        var doc = domParser.parseFromString(requestPage(url + separator + "page=" + currentPage), "text/html");
        var videos = extractVideosFromDom(doc);
        return videos.length ? new VideoPager(videos, true) : errorPager("No se encontraron videos en el canal.");
    } catch (e) {
        return errorPager("Canal: " + (e.message || String(e)));
    }
}

function extractJsonObject(textValue, startIndex) {
    if (!textValue || startIndex < 0) return null;
    var from = textValue.indexOf("{", startIndex);
    if (from < 0) return null;
    var depth = 0, quoted = false, escaped = false;
    for (var i = from; i < textValue.length; i++) {
        var ch = textValue[i];
        if (quoted) {
            if (escaped) escaped = false;
            else if (ch === "\\") escaped = true;
            else if (ch === "\"") quoted = false;
        } else if (ch === "\"") {
            quoted = true;
        } else if (ch === "{") {
            depth++;
        } else if (ch === "}") {
            depth--;
            if (depth === 0) return textValue.substring(from, i + 1);
        }
    }
    return null;
}

function parsePlayerConfig(body) {
    var patterns = [/var\s+flashvars_\d+\s*=\s*/i, /var\s+flashvars\s*=\s*/i, /flashvars_\d+\s*=\s*/i];
    for (var i = 0; i < patterns.length; i++) {
        var match = body.match(patterns[i]);
        if (!match) continue;
        var json = extractJsonObject(body, match.index);
        if (!json) continue;
        try {
            var obj = JSON.parse(json);
            if (obj && typeof obj === "object") return obj;
        } catch (e) {}
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

function getVideoDetailsPage(url) {
    var response = requestPage(url);
    var config = parsePlayerConfig(response) || {};
    var sources = [];
    var mediaDefs = config.mediaDefinitions || [];

    for (var i = 0; i < mediaDefs.length; i++) {
        var media = mediaDefs[i] || {};
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
        id: config.video_id || config.video_url || getViewKey(url) || url,
        name: config.video_title || config.title || "Video",
        url: url,
        videoSources: sources,
        subtitles: subtitles,
        author: new PlatformAuthorLink("", "Autor", "", null),
        description: config.description || "",
        thumbnails: [absoluteUrl(config.image_url || config.imageUrl || "")]
    });
}

source.isChannelUrl = function (url) {
    return isChannelUrl(url);
};

source.getChannel = function (url) {
    return getChannelPage(url);
};

source.getChannelContents = function (url, type, order, filters) {
    return getChannelContentsPage(url, 1);
};

source.isContentDetailsUrl = function (url) {
    return isVideoUrl(url);
};

source.getContentDetails = function (url) {
    return getVideoDetailsPage(url);
};

source.search = function (query, type, order, filters) {
    return searchPage(query, filters);
};

source.getHome = function () {
    return getHomePage();
};

source.getSearchCapabilities = function () {
    return {
        types: [Type.Feed.Mixed],
        sorts: [Type.Order.Chronological],
        filters: [
            { id: "duration", type: "DropdownFilter", name: "Duración", options: [
                { id: "", name: "Cualquiera" },
                { id: "10", name: "Hasta 10 minutos" },
                { id: "20", name: "Hasta 20 minutos" },
                { id: "30", name: "Más de 20 minutos" }
            ], defaultOption: "" },
            { id: "quality", type: "DropdownFilter", name: "Calidad", options: [
                { id: "", name: "Todas" },
                { id: "hd", name: "HD" }
            ], defaultOption: "" }
        ]
    };
};

log("PornHub Plugin v12 loaded");
