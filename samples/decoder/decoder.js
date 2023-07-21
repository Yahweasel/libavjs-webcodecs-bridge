importScripts("../worker-util.js");

onmessage = async ev => {
    const file = ev.data;
    console.error(file);
    let streams, configs, allPackets;

    try {
        [streams, configs, allPackets] =
            await sampleDemux(file);
    } catch (ex) {
        console.error(ex);
        return;
    }

    for (let idx = 0; idx < streams.length; idx++) {
        const stream = streams[idx];
        const config = configs[idx];
        if (!config)
            continue;
        const packets = allPackets[stream.index];

        try {
            if (stream.codec_type === 0 /* video */) {
                await decodeVideo(config, packets, stream);
            } else if (stream.codec_type === 1 /* audio */) {
                await decodeAudio(config, packets, stream);
            }
        } catch (ex) {
            console.error(ex);
        }
    }

    postMessage({c: "done"});
};
