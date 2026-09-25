const PORNHUB_BASE_URL = "https://www.pornhub.com";

const BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "es-419,es;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": PORNHUB_BASE_URL + "/",
    "Cookie": "age_verified=1; accessAgeDisclaimerPH=1"
};

function getNodeText(node, fallback) {
    if (!node) return fallback || "";

    if (typeof node.text === "string") {
        return node.text.trim();
    }

    if (typeof node.textContent === "string") {
        return node.textContent.trim();
    }

    return fallback || "";
}

function getNodeAttribute(node, attribute, fallback) {
    if (!node) return fallback || "";

    const value = node.getAttribute(attribute);
    return value || fallback || "";
}

function normalizeUrl(value) {
    if (!value) return "";

    const url = String(value).trim();

    if (/^https?:\/\//i.test(url)) {
        return url;
    }

    if (/^\/\//.test(url)) {
        return "https:" + url;
    }

    if (/^\//.test(url)) {
        return PORNHUB_BASE_URL + url;
    }

    return PORNHUB_BASE_URL + "/" + url;
}

function getViewKey(url) {
    if (!url) return "";

    const match = String(url).match(/[?&]viewkey=([^&#]+)/i);
    return match ? match[1] : "";
}

function isChannelUrl(url) {
    if (!url) return false;

    const value = String(url).trim().toLowerCase();

    return (
        /pornhub\.com\/(model|pornstar|channel|channels|user)\//i.test(value) ||
        /\/(model|pornstar|channel|channels|user)\//i.test(value)
    );
}

function isContentDetailsUrl(url) {
    if (!url) return false;

    const value = String(url);

    return (
        /(?:^|[?&])viewkey=[^&#]+/i.test(value) ||
        /\/view_video\.php/i.test(value)
    );
}

function getSearchFilters() {
    return [
        {
            id: "duration",
            type: "DropdownFilter",
            name: "Duración",
            options: [
                { id: "", name: "Cualquiera" },
                { id: "10", name: "Hasta 10 minutos" },
                { id: "20", name: "Hasta 20 minutos" },
                { id: "30", name: "Más de 20 minutos" }
            ],
            defaultOption: ""
        },
        {
            id: "quality",
            type: "DropdownFilter",
            name: "Calidad",
            options: [
                { id: "", name: "Todas" },
                { id: "hd", name: "HD" }
            ],
            defaultOption: ""
        }
    ];
}

function createErrorVideo(message) {
    return new VideoListPager([
        new PlatformVideo({
            id: "pornhub_error",
            name: "ERROR: " + message,
            url: PORNHUB_BASE_URL,
            thumbnails: new VideoThumbnails([]),
            author: new PlatformAuthorLink(
                PORNHUB_BASE_URL,
                "Diagnóstico",
                PORNHUB_BASE_URL,
                null
            ),
            duration: 0,
            viewCount: 0,
            isLive: false
        })
    ], false);
}

function parseDuration(value) {
    if (!value) return 0;

    const parts = String(value)
        .trim()
        .split(":")
        .map(function (part) {
            return parseInt(part, 10) || 0;
        });

    if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    }

    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }

    return 0;
}

function extractVideosFromDom(dom) {
    if (!dom) return [];

    const videos = [];
    const usedIds = {};

    const nodes = dom.querySelectorAll(
        "li.pcVideoListItem, " +
        ".videoBox, " +
        ".video-item, " +
        ".videoPreview, " +
        "[data-video-vkey], " +
        ".video-card, " +
        ".videoListingItem"
    );

    if (!nodes || nodes.length === 0) {
        return videos;
    }

    for (const node of nodes) {
        const links = node.querySelectorAll("a");

        let videoLink = null;
        let href = "";

        for (const link of links) {
            const candidate = getNodeAttribute(link, "href", "");

            if (!candidate) continue;

            const clean = String(candidate).trim();

            if (
                /(?:^|[?&])viewkey=/i.test(clean) ||
                /\/view_video\.php/i.test(clean)
            ) {
                videoLink = link;
                href = clean;
                break;
            }
        }

        if (!videoLink || !href) continue;

        const videoUrl = normalizeUrl(href);
        const viewKey = getViewKey(videoUrl);

        if (!viewKey || usedIds[viewKey]) continue;

        usedIds[viewKey] = true;

        const titleNode =
            node.querySelector(".vidTitleWrapper .title a") ||
            node.querySelector(".videoTitle a") ||
            node.querySelector(".title a") ||
            node.querySelector("a[title]") ||
            videoLink;

        const title = getNodeText(titleNode, "Sin título");

        const imageNode =
            node.querySelector("img[data-mediumthumb]") ||
            node.querySelector("img[data-thumb]") ||
            node.querySelector("img[data-src]") ||
            node.querySelector("img");

        const thumbnail = normalizeUrl(
            getNodeAttribute(imageNode, "data-mediumthumb", "") ||
            getNodeAttribute(imageNode, "data-thumb", "") ||
            getNodeAttribute(imageNode, "data-src", "") ||
            getNodeAttribute(imageNode, "src", "")
        );

        const authorNode =
            node.querySelector(".usernameWrap a") ||
            node.querySelector(".videoUploader a") ||
            node.querySelector("a[href*='/model/']") ||
            node.querySelector("a[href*='/pornstar/']") ||
            node.querySelector("a[href*='/channel/']") ||
            node.querySelector("a[href*='/user/']");

        const authorName = getNodeText(authorNode, "Desconocido");
        const authorUrl = authorNode
            ? normalizeUrl(getNodeAttribute(authorNode, "href", ""))
            : PORNHUB_BASE_URL + "/channels/";

        const durationNode =
            node.querySelector(".duration") ||
            node.querySelector(".videoDuration") ||
            node.querySelector(".durationText") ||
            node.querySelector("[data-duration]");

        const duration = parseDuration(getNodeText(durationNode, ""));

        videos.push(new PlatformVideo({
            id: viewKey,
            name: title,
            url: videoUrl,
            thumbnails: new VideoThumbnails([
                new VideoThumbnail(thumbnail)
            ]),
            author: new PlatformAuthorLink(
                authorUrl,
                authorName,
                authorUrl,
                null
            ),
            duration: duration,
            viewCount: 0,
            isLive: false
        }));
    }

    return videos;
}

function search(query, type, order, filters) {
    try {
        let url =
            PORNHUB_BASE_URL +
            "/video/search?search=" +
            encodeURIComponent(query || "");

        if (filters) {
            if (filters.duration) {
                url += "&min_duration=" + encodeURIComponent(filters.duration);
            }

            if (filters.quality === "hd") {
                url += "&hd=1";
            }
        }

        const response = Http.get(url, BROWSER_HEADERS);

        if (!response || !response.isOk) {
            throw new Error("HTTP " + (response ? response.code : "desconocido"));
        }

        if (!response.body || response.body.length < 500) {
            throw new Error("PornHub devolvió una respuesta vacía o bloqueada.");
        }

        const dom = DOMParser.parse(response.body);
        const videos = extractVideosFromDom(dom);

        if (videos.length === 0) {
            throw new Error("No se encontraron videos en los resultados.");
        }

        return new VideoListPager(videos, false);
    } catch (error) {
        return createErrorVideo("Búsqueda: " + (error.message || String(error)));
    }
}

function getChannel(url) {
    try {
        const finalUrl = String(url || "").trim();

        if (!finalUrl) {
            throw new Error("URL de canal vacía.");
        }

        const response = Http.get(finalUrl, BROWSER_HEADERS);

        if (!response || !response.isOk) {
            throw new Error("HTTP " + (response ? response.code : "desconocido"));
        }

        if (!response.body || response.body.length < 500) {
            throw new Error("PornHub devolvió una respuesta vacía o bloqueada.");
        }

        const body = response.body.toLowerCase();

        if (
            body.indexOf("captcha") >= 0 ||
            body.indexOf("access denied") >= 0 ||
            body.indexOf("verify you are human") >= 0 ||
            body.indexOf("bot protection") >= 0
        ) {
            throw new Error("PornHub devolvió una página anti-bot.");
        }

        const dom = DOMParser.parse(response.body);

        const nameNode =
            dom.querySelector("h1[itemprop='name']") ||
            dom.querySelector("h1.name") ||
            dom.querySelector(".channelName") ||
            dom.querySelector(".profile-name") ||
            dom.querySelector("h1");

        const avatarNode =
            dom.querySelector("#getAvatar img") ||
            dom.querySelector("#getAvatar") ||
            dom.querySelector(".avatar img") ||
            dom.querySelector(".profileAvatar img") ||
            dom.querySelector("img.avatar") ||
            dom.querySelector("img[alt*='profile']");

        const bannerNode =
            dom.querySelector("#coverPictureDefault img") ||
            dom.querySelector("#coverPictureDefault") ||
            dom.querySelector(".cover img") ||
            dom.querySelector(".banner img");

        const descriptionNode =
            dom.querySelector(".aboutMeText") ||
            dom.querySelector(".bio") ||
            dom.querySelector(".description") ||
            dom.querySelector(".profile-description");

        const avatar =
            getNodeAttribute(avatarNode, "src", "") ||
            getNodeAttribute(avatarNode, "data-src", "");

        const banner =
            getNodeAttribute(bannerNode, "src", "") ||
            getNodeAttribute(bannerNode, "data-src", "");

        return new PlatformChannel({
            id: finalUrl,
            name: getNodeText(nameNode, "Canal"),
            thumbnail: normalizeUrl(avatar),
            banner: normalizeUrl(banner),
            url: finalUrl,
            description: getNodeText(descriptionNode, "")
        });
    } catch (error) {
        throw new Error("Fallo al cargar perfil: " + (error.message || String(error)));
    }
}

function getChannelContents(url, page) {
    try {
        const finalUrl = String(url || "").trim();

        if (!finalUrl) {
            return createErrorVideo("URL de canal vacía.");
        }

        const currentPage = page || 1;
        const separator = finalUrl.indexOf("?") >= 0 ? "&" : "?";
        const pagedUrl = finalUrl + separator + "page=" + currentPage;

        const response = Http.get(pagedUrl, BROWSER_HEADERS);

        if (!response || !response.isOk) {
            throw new Error("HTTP " + (response ? response.code : "desconocido"));
        }

        if (!response.body || response.body.length < 500) {
            throw new Error("PornHub devolvió una respuesta vacía o bloqueada.");
        }

        const dom = DOMParser.parse(response.body);
        const videos = extractVideosFromDom(dom);

        if (videos.length === 0 && currentPage === 1) {
            return createErrorVideo("No se encontraron videos en el canal.");
        }

        return new VideoListPager(videos, videos.length > 0);
    } catch (error) {
        return createErrorVideo("Canal: " + (error.message || String(error)));
    }
}

function extractJsonObject(text, startIndex) {
    if (!text || startIndex < 0) return null;

    const objectStart = text.indexOf("{", startIndex);

    if (objectStart < 0) return null;

    let depth = 0;
    let insideString = false;
    let escaped = false;

    for (let i = objectStart; i < text.length; i++) {
        const character = text[i];

        if (insideString) {
            if (escaped) {
                escaped = false;
            } else if (character === "\\") {
                escaped = true;
            } else if (character === "\"") {
                insideString = false;
            }

            continue;
        }

        if (character === "\"") {
            insideString = true;
            continue;
        }

        if (character === "{") {
            depth++;
        } else if (character === "}") {
            depth--;

            if (depth === 0) {
                return text.substring(objectStart, i + 1);
            }
        }
    }

    return null;
}

function parsePlayerConfig(body) {
    if (!body) return {};

    const patterns = [
        /var\s+flashvars_\d+\s*=\s*/i,
        /var\s+flashvars\s*=\s*/i,
        /flashvars_\d+\s*=\s*/i
    ];

    for (const pattern of patterns) {
        const match = body.match(pattern);

        if (!match) continue;

        const jsonText = extractJsonObject(body, match.index);

        if (!jsonText) continue;

        try {
            const config = JSON.parse(jsonText);

            if (config && typeof config === "object") {
                return config;
            }
        } catch (error) {
            // sigue con el siguiente formato
        }
    }

    const config = {};

    const videoUrlMatch = body.match(/["']video_url["']\s*:\s*["']([^"']+)["']/i);
    const videoTitleMatch = body.match(/["']video_title["']\s*:\s*["']([^"']*)["']/i);
    const imageUrlMatch = body.match(/["']image_url["']\s*:\s*["']([^"']*)["']/i);
    const captionsMatch = body.match(/["']closedCaptionsFile["']\s*:\s*["']([^"']+)["']/i);

    if (videoUrlMatch) {
        config.video_url = videoUrlMatch[1];
    }

    if (videoTitleMatch) {
        config.video_title = videoTitleMatch[1];
    }

    if (imageUrlMatch) {
        config.image_url = imageUrlMatch[1];
    }

    if (captionsMatch) {
        config.closedCaptionsFile = captionsMatch[1];
    }

    return config;
}

function getVideoDetails(url) {
    try {
        const response = Http.get(url, BROWSER_HEADERS);

        if (!response || !response.isOk) {
            throw new Error("Error de red al obtener video: HTTP " + (response ? response.code : "desconocido"));
        }

        if (!response.body || response.body.length < 500) {
            throw new Error("PornHub devolvió una respuesta vacía o bloqueada.");
        }

        let config = parsePlayerConfig(response.body) || {};
        const videoSources = [];

        if (!config || Object.keys(config).length === 0) {
            const directVideo = response.body.match(/["']video_url["']\s*:\s*["']([^"']+)["']/i);
            const directTitle = response.body.match(/["']video_title["']\s*:\s*["']([^"']*)["']/i);
            const directImage = response.body.match(/["']image_url["']\s*:\s*["']([^"']*)["']/i);

            config = {
                video_url: directVideo ? directVideo[1] : "",
                video_title: directTitle ? directTitle[1] : "Video",
                image_url: directImage ? directImage[1] : ""
            };
        }

        const mediaDefinitions = config.mediaDefinitions || [];
        for (const media of mediaDefinitions) {
            if (!media) continue;

            const sourceUrl =
                media.videoUrl ||
                media.video_url ||
                media.url ||
                "";

            if (!sourceUrl) continue;

            const qualityValue =
                parseInt(
                    media.quality ||
                    media.height ||
                    0,
                    10
                ) || 0;

            videoSources.push(new VideoSource({
                url: sourceUrl,
                quality: qualityValue > 0 ? qualityValue + "p" : "Auto",
                format: media.format || "mp4",
                width: parseInt(media.width || 0, 10) || 0,
                height: qualityValue
            }));
        }

        if (videoSources.length === 0 && config.videoUrl) {
            videoSources.push(new VideoSource({
                url: config.videoUrl,
                quality: "Auto",
                format: "mp4",
                width: 0,
                height: 0
            }));
        }

        if (videoSources.length === 0 && config.video_url) {
            videoSources.push(new VideoSource({
                url: config.video_url,
                quality: "Auto",
                format: "mp4",
                width: 0,
                height: 0
            }));
        }

        if (videoSources.length === 0) {
            throw new Error("No se pudieron extraer fuentes de video. El reproductor pudo haber cambiado.");
        }

        const captionsUrl =
            config.closedCaptionsFile ||
            config.closed_captions ||
            config.subtitleUrl ||
            "";

        const subtitles = [];

        if (captionsUrl) {
            subtitles.push(new SubtitleSource({
                url: captionsUrl,
                name: "Subtítulos",
                format: "vtt"
            }));
        }

        const videoId =
            config.video_id ||
            config.video_url ||
            getViewKey(url) ||
            url;

        const thumbnailUrl =
            config.image_url ||
            config.imageUrl ||
            "";

        return new VideoDetails({
            id: videoId,
            name: config.video_title || config.title || "Video",
            url: url,
            videoSources: videoSources,
            subtitles: subtitles,
            author: new PlatformAuthorLink("", "Autor", "", null),
            description: config.description || "",
            thumbnails: new VideoThumbnails([
                new VideoThumbnail(thumbnailUrl)
            ])
        });
    } catch (error) {
        throw new Error("Fallo al cargar video: " + (error.message || String(error)));
    }
}

function getHome() {
    try {
        const url = PORNHUB_BASE_URL + "/video";
        const response = Http.get(url, BROWSER_HEADERS);

        if (!response || !response.isOk) {
            return createErrorVideo("No se pudo cargar la página principal.");
        }

        if (!response.body || response.body.length < 500) {
            return createErrorVideo("Página principal vacía o bloqueada.");
        }

        const dom = DOMParser.parse(response.body);
        const videos = extractVideosFromDom(dom);

        if (videos.length === 0) {
            return createErrorVideo("No se encontraron videos en la página principal.");
        }

        return new VideoListPager(videos, false);
    } catch (error) {
        return createErrorVideo("Error al cargar home: " + (error.message || String(error)));
    }
}
