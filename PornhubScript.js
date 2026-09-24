function getSearchFilters() {
    return [
        {
            id: "duration",
            type: "DropdownFilter",
            name: "Duración",
            options: [
                { id: "", name: "Cualquiera" },
                { id: "10", name: "Corta (1-10 min)" },
                { id: "20", name: "Media (10-20 min)" },
                { id: "30", name: "Larga (+20 min)" }
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

function search(query, type, order, filters) {
    let url = `https://www.pornhub.com/video/search?search=${encodeURIComponent(query)}`;
    if (filters) {
        if (filters.duration) url += `&min_duration=${filters.duration}`;
        if (filters.quality === "hd") url += `&hd=1`;
    }

    const response = Http.get(url);
    const dom = DOMParser.parse(response.body);
    const videos = [];
    
    const nodes = dom.querySelectorAll(".pcVideoListItem");
    for (const node of nodes) {
        const a = node.querySelector("a");
        if (!a) continue;
        
        const href = a.getAttribute("href");
        if (!href.includes("viewkey=")) continue;

        const title = node.querySelector(".title") ? node.querySelector(".title").text : "Sin título";
        const img = node.querySelector("img");
        const thumbUrl = img ? (img.getAttribute("data-thumb_url") || img.getAttribute("src")) : "";
        const authorNode = node.querySelector(".usernameWrap a");
        const authorName = authorNode ? authorNode.text : "Desconocido";
        const authorUrl = authorNode ? `https://www.pornhub.com${authorNode.getAttribute("href")}` : "";

        videos.push(new PlatformVideo({
            id: href.split("viewkey=")[1],
            name: title,
            url: `https://www.pornhub.com${href}`,
            thumbnails: new VideoThumbnails([new VideoThumbnail(thumbUrl)]),
            author: new PlatformAuthorLink(authorUrl, authorName, authorUrl, null),
            duration: 0, 
            viewCount: 0,
            isLive: false
        }));
    }
    return new VideoListPager(videos, false);
}

function getVideoDetails(url) {
    const response = Http.get(url);
    const body = response.body;
    
    const flashvarsMatch = body.match(/var flashvars_[\d]+ = (\{.*?\});/);
    if (!flashvarsMatch) throw new Error("Parámetros del reproductor no encontrados.");
    
    const config = JSON.parse(flashvarsMatch[1]);
    const videoSources = [];
    
    if (config.mediaDefinitions) {
        for (const media of config.mediaDefinitions) {
            if (media.videoUrl && media.videoUrl.length > 0) {
                videoSources.push(new VideoSource({
                    url: media.videoUrl,
                    quality: media.quality ? media.quality.toString() + "p" : "Auto",
                    format: media.format || "mp4",
                    width: parseInt(media.quality) || 0,
                    height: parseInt(media.quality) || 0
                }));
            }
        }
    }

    const subtitles = [];
    if (config.closedCaptionsFile) {
        subtitles.push(new SubtitleSource({
            url: config.closedCaptionsFile,
            name: "Subtítulos",
            format: "vtt"
        }));
    }

    return new VideoDetails({
        id: config.video_url || url.split("viewkey=")[1],
        name: config.video_title || "Video",
        url: url,
        videoSources: videoSources,
        subtitles: subtitles,
        author: new PlatformAuthorLink("", "Autor", "", null),
        description: "",
        thumbnails: new VideoThumbnails([new VideoThumbnail(config.image_url)])
    });
}

function getChannel(url) {
    const response = Http.get(url);
    const dom = DOMParser.parse(response.body);
    
    const nameNode = dom.querySelector("h1[itemprop='name']");
    const avatarNode = dom.querySelector("#getAvatar");
    const bannerNode = dom.querySelector("#coverPictureDefault");
    const descNode = dom.querySelector(".aboutMeText");

    return new PlatformChannel({
        id: url,
        name: nameNode ? nameNode.text : "Canal",
        thumbnail: avatarNode ? avatarNode.getAttribute("src") : "",
        banner: bannerNode ? bannerNode.getAttribute("src") : "",
        url: url,
        description: descNode ? descNode.text : ""
    });
}

function getChannelContents(url, page) {
    let pagedUrl = url.includes("?") ? `${url}&page=${page}` : `${url}/videos?page=${page}`;
    const response = Http.get(pagedUrl);
    const dom = DOMParser.parse(response.body);
    const videos = [];
    
    const nodes = dom.querySelectorAll(".pcVideoListItem");
    for (const node of nodes) {
        const a = node.querySelector("a");
        if (!a) continue;
        
        const href = a.getAttribute("href");
        if (!href.includes("viewkey=")) continue;

        videos.push(new PlatformVideo({
            id: href.split("viewkey=")[1],
            name: node.querySelector(".title") ? node.querySelector(".title").text : "",
            url: `https://www.pornhub.com${href}`,
            thumbnails: new VideoThumbnails([new VideoThumbnail(node.querySelector("img") ? node.querySelector("img").getAttribute("src") : "")]),
            author: new PlatformAuthorLink(url, "Canal", url, null),
            duration: 0,
            viewCount: 0,
            isLive: false
        }));
    }
    
    return new VideoListPager(videos, nodes.length > 0);
}